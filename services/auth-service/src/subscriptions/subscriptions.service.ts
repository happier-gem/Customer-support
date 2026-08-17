import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ASSIGNABLE_TEAM_ROLES,
  PLAN_FEATURES,
  PLAN_LIMITS,
  PLAN_TYPES,
  PlanFeature,
  PlanLimits,
  PlanType,
  ROLES,
  RpcAuthContext,
  SubscriptionDto,
  SubscriptionPlanDto,
  SubscriptionUsageDto,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanLimitExceededException } from './plan-limit.exception';
import { startOfCurrentMonthInTimezone } from './month-boundary.util';

/**
 * A plain PrismaService and a Prisma transaction client expose the same
 * query methods (PrismaService extends PrismaClient, which is a structural
 * superset of Prisma.TransactionClient), so every read/enforcement method
 * here accepts either — callers integrating a limit check into their own
 * `$transaction` pass their `tx`; the read-only endpoints pass `this.prisma`.
 */
type Db = Prisma.TransactionClient | PrismaService;

/**
 * Phase 6: owns subscription plan state and feature-limit enforcement for
 * every tenant-owned resource that has a plan limit (team members, tickets,
 * feedback forms). Centralized here rather than scattered per-controller so
 * every enforcement point uses the exact same plan/limit/usage logic.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Phase 10: limits are now platform-admin-editable, stored in `PlanLimit`
   * (one seeded row per plan — see the phase10 migration). `PLAN_LIMITS` is
   * kept only as a defensive fallback if a row is ever somehow missing, so a
   * migration hiccup degrades to the original hardcoded defaults rather than
   * crashing every tenant-scoped write.
   */
  private async getLimits(db: Db, plan: PlanType): Promise<PlanLimits> {
    const row = await db.planLimit.findUnique({ where: { plan } });
    if (!row) return PLAN_LIMITS[plan];
    return { teamMembers: row.teamMembers, monthlyTickets: row.monthlyTickets, feedbackForms: row.feedbackForms };
  }

  /** The non-tenant-specific catalog of all three plans (Part 12: GET /subscription/plans). */
  async listPlans(): Promise<SubscriptionPlanDto[]> {
    const rows = await this.prisma.planLimit.findMany();
    const byPlan = new Map(rows.map((r) => [r.plan, r]));
    return (Object.keys(PLAN_TYPES) as PlanType[]).map((plan) => {
      const row = byPlan.get(plan);
      return {
        plan,
        limits: row
          ? { teamMembers: row.teamMembers, monthlyTickets: row.monthlyTickets, feedbackForms: row.feedbackForms }
          : PLAN_LIMITS[plan],
      };
    });
  }

  /**
   * Platform-admin-only (asserted by AdminService before this is called).
   * Always a full overwrite of all three fields, never a partial merge —
   * the admin UI always submits the complete set, so there's no ambiguity
   * between "field omitted" and "field explicitly cleared to unlimited".
   */
  async updatePlanLimits(plan: PlanType, limits: PlanLimits): Promise<SubscriptionPlanDto> {
    const row = await this.prisma.planLimit.update({
      where: { plan },
      data: {
        teamMembers: limits.teamMembers,
        monthlyTickets: limits.monthlyTickets,
        feedbackForms: limits.feedbackForms,
      },
    });
    return {
      plan,
      limits: { teamMembers: row.teamMembers, monthlyTickets: row.monthlyTickets, feedbackForms: row.feedbackForms },
    };
  }

  async getSubscription(authContext: RpcAuthContext): Promise<SubscriptionDto> {
    this.assertTenantOwner(authContext);
    return this.buildSubscriptionDto(this.prisma, authContext.organizationId);
  }

  /**
   * Mock plan change (Part 13) — no payment processing. Downgrades are
   * allowed even when current usage exceeds the target plan's limits (Part
   * 15): existing data is never touched here, only `plan` changes. The
   * enforcement methods below are what then block *new* over-limit resources.
   */
  async changePlan(authContext: RpcAuthContext, plan: PlanType): Promise<SubscriptionDto> {
    this.assertTenantOwner(authContext);
    await this.prisma.organization.update({
      where: { id: authContext.organizationId },
      data: { plan },
    });
    return this.buildSubscriptionDto(this.prisma, authContext.organizationId);
  }

  private assertTenantOwner(authContext: RpcAuthContext): void {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can manage the organization subscription.');
    }
  }

  private async buildSubscriptionDto(db: Db, organizationId: string): Promise<SubscriptionDto> {
    const org = await db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { plan: true, timezone: true },
    });
    const [usage, limits] = await Promise.all([
      this.getUsage(db, organizationId, org.timezone),
      this.getLimits(db, org.plan as PlanType),
    ]);
    return {
      organizationId,
      plan: org.plan as PlanType,
      limits,
      usage,
    };
  }

  /** Part 11: usage is always computed live from the database, never cached/faked. */
  private async getUsage(db: Db, organizationId: string, timezone: string): Promise<SubscriptionUsageDto> {
    const monthStart = startOfCurrentMonthInTimezone(timezone);
    const [teamMembers, monthlyTickets, feedbackForms] = await Promise.all([
      db.user.count({ where: { organizationId, role: { in: [...ASSIGNABLE_TEAM_ROLES] }, isActive: true } }),
      db.ticket.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      db.feedbackForm.count({ where: { organizationId } }),
    ]);
    return { teamMembers, monthlyTickets, feedbackForms };
  }

  // ---------------------------------------------------------------------
  // Enforcement — each method must be called from *inside* the same Prisma
  // transaction that goes on to create the resource, so the advisory lock
  // (held for the transaction's lifetime) and the subsequent insert are
  // atomic: two concurrent requests for the same org+feature serialize on
  // the lock, so a count-then-create race can never let both through when
  // only one more slot is available (Part 29).
  // ---------------------------------------------------------------------

  /**
   * Acquires a per-org, per-feature Postgres advisory lock. Inside a
   * transaction it is held (and serializes concurrent callers) until that
   * transaction commits/rolls back; called with a bare PrismaService (no
   * surrounding transaction — the soft invite-time pre-check) it is released
   * immediately since Prisma runs that single statement as its own
   * auto-committed transaction, which is fine for a non-authoritative check.
   */
  private async lockFeature(db: Db, organizationId: string, feature: PlanFeature): Promise<void> {
    const lockKey = `sub:${feature}:${organizationId}`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
  }

  async assertCanCreateTicket(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
    await this.lockFeature(tx, organizationId, PLAN_FEATURES.MONTHLY_TICKETS);

    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true, timezone: true } });
    const plan = org.plan as PlanType;
    const limit = (await this.getLimits(tx, plan)).monthlyTickets;
    if (limit === null) return;

    const monthStart = startOfCurrentMonthInTimezone(org.timezone);
    const count = await tx.ticket.count({ where: { organizationId, createdAt: { gte: monthStart } } });
    if (count >= limit) {
      const message = `Your ${plan} plan allows ${limit} tickets per month. Upgrade your plan to create more.`;
      // Independent write via `this.prisma` (never `tx`): the transaction this check runs
      // inside is about to abort (the caller never gets to create the ticket), but "the
      // limit was hit" is true regardless and must survive that rollback (Step 14).
      await this.notifications.notifyPlanLimitReached(organizationId, 'Monthly ticket limit reached', message);
      throw new PlanLimitExceededException(PLAN_FEATURES.MONTHLY_TICKETS, plan, limit, count, message);
    }
  }

  /**
   * Called both as a soft pre-check when a Tenant Owner sends an invitation
   * (so obviously-futile invites are rejected early — `db` is just
   * `this.prisma` there, no surrounding transaction) and as the authoritative,
   * lock-protected check when an invitation is accepted and the seat is
   * actually consumed (`db` is that transaction's `tx`).
   */
  async assertCanAddTeamMember(db: Db, organizationId: string): Promise<void> {
    await this.lockFeature(db, organizationId, PLAN_FEATURES.TEAM_MEMBERS);

    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
    const plan = org.plan as PlanType;
    const limit = (await this.getLimits(db, plan)).teamMembers;
    if (limit === null) return;

    const count = await db.user.count({
      where: { organizationId, role: { in: [...ASSIGNABLE_TEAM_ROLES] }, isActive: true },
    });
    if (count >= limit) {
      const message = `Your ${plan} plan allows a maximum of ${limit} team members. Upgrade your plan to add more.`;
      await this.notifications.notifyPlanLimitReached(organizationId, 'Team member limit reached', message);
      throw new PlanLimitExceededException(PLAN_FEATURES.TEAM_MEMBERS, plan, limit, count, message);
    }
  }

  async assertCanCreateFeedbackForm(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
    await this.lockFeature(tx, organizationId, PLAN_FEATURES.FEEDBACK_FORMS);

    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
    const plan = org.plan as PlanType;
    const limit = (await this.getLimits(tx, plan)).feedbackForms;
    if (limit === null) return;

    const count = await tx.feedbackForm.count({ where: { organizationId } });
    if (count >= limit) {
      const message =
        limit === 0
          ? `Your ${plan} plan does not include custom feedback forms. Upgrade to Starter or Pro to create feedback forms.`
          : `Your ${plan} plan allows a maximum of ${limit} feedback forms. Upgrade your plan to create more.`;
      await this.notifications.notifyPlanLimitReached(organizationId, 'Feedback form limit reached', message);
      throw new PlanLimitExceededException(PLAN_FEATURES.FEEDBACK_FORMS, plan, limit, count, message);
    }
  }
}
