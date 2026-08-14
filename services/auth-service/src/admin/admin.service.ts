import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Organization, Prisma } from '@prisma/client';
import {
  ADMIN_ORG_DEFAULT_PAGE_SIZE,
  ADMIN_ORG_MAX_PAGE_SIZE,
  AdminOrganizationDto,
  ASSIGNABLE_TEAM_ROLES,
  ORGANIZATION_STATUSES,
  PaginatedResult,
  PLAN_TYPES,
  PlanType,
  PlatformStatsDto,
  ROLES,
  RpcAuthContext,
  SubscriptionPlanDto,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export interface AdminOrganizationListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  plan?: PlanType;
  status?: 'ACTIVE' | 'SUSPENDED';
}

/** Start of the current UTC calendar month — a platform-wide aggregate has no single organization's timezone to honor, unlike AnalyticsService's per-tenant number. */
function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Owns Phase 9's platform-level administration: cross-tenant organization visibility,
 * platform-wide statistics, plan-catalog visibility, and organization suspension. Every
 * method asserts `authContext.role === PLATFORM_ADMIN` itself — defense in depth alongside
 * the gateway's `@Roles(ROLES.PLATFORM_ADMIN)` guard, the same two-layer discipline as
 * every other service in this codebase.
 *
 * Deliberately outside `authContext.organizationId` entirely: a platform admin operates
 * *above* any single tenant, so unlike every tenant-scoped service (TicketsService,
 * FeedbackService, ...), nothing here is ever filtered by the caller's own organization —
 * `organizationId` only ever appears as the *target* of a lookup (`getOrganization`,
 * `setSuspended`), resolved from the route, never as the caller's scope.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private assertPlatformAdmin(authContext: RpcAuthContext): void {
    if (authContext.role !== ROLES.PLATFORM_ADMIN) {
      throw new ForbiddenException('Only a platform admin can perform this action.');
    }
  }

  async listOrganizations(
    authContext: RpcAuthContext,
    query: AdminOrganizationListQuery,
  ): Promise<PaginatedResult<AdminOrganizationDto>> {
    this.assertPlatformAdmin(authContext);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, ADMIN_ORG_MAX_PAGE_SIZE) : ADMIN_ORG_DEFAULT_PAGE_SIZE;

    const where: Prisma.OrganizationWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (query.plan) {
      where.plan = query.plan;
    }
    if (query.status === ORGANIZATION_STATUSES.ACTIVE) {
      where.isSuspended = false;
    } else if (query.status === ORGANIZATION_STATUSES.SUSPENDED) {
      where.isSuspended = true;
    }

    const [total, orgs] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = await Promise.all(orgs.map((org) => this.toDto(org)));

    return {
      data,
      pagination: { page, limit: pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async getOrganization(authContext: RpcAuthContext, organizationId: string): Promise<AdminOrganizationDto> {
    this.assertPlatformAdmin(authContext);

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.toDto(org);
  }

  async setSuspended(authContext: RpcAuthContext, organizationId: string, isSuspended: boolean): Promise<AdminOrganizationDto> {
    this.assertPlatformAdmin(authContext);

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.organization.update({ where: { id: organizationId }, data: { isSuspended } });
    return this.toDto(updated);
  }

  /** Reuses SubscriptionsService's own static plan catalog — Phase 6's plans are fixed business constants, so there is nothing here to duplicate or re-derive. */
  listPlans(authContext: RpcAuthContext): SubscriptionPlanDto[] {
    this.assertPlatformAdmin(authContext);
    return this.subscriptions.listPlans();
  }

  async getPlatformStats(authContext: RpcAuthContext): Promise<PlatformStatsDto> {
    this.assertPlatformAdmin(authContext);

    const [totalOrgs, suspendedOrgs, planCounts, ticketsThisMonth, feedbackForms, activeTeamMembers] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { isSuspended: true } }),
      this.prisma.organization.groupBy({ by: ['plan'], _count: { _all: true } }),
      this.prisma.ticket.count({ where: { createdAt: { gte: startOfCurrentUtcMonth() } } }),
      this.prisma.feedbackForm.count(),
      this.prisma.user.count({ where: { isActive: true, role: { in: [...ASSIGNABLE_TEAM_ROLES] } } }),
    ]);

    const plans: Record<PlanType, number> = { [PLAN_TYPES.FREE]: 0, [PLAN_TYPES.STARTER]: 0, [PLAN_TYPES.PRO]: 0 };
    for (const row of planCounts) {
      plans[row.plan as PlanType] = row._count._all;
    }

    return {
      organizations: { total: totalOrgs, active: totalOrgs - suspendedOrgs, suspended: suspendedOrgs },
      plans,
      usage: { ticketsThisMonth, feedbackForms, activeTeamMembers },
    };
  }

  /**
   * Every count here is its own database-level COUNT (Step 29) — "active team members"
   * reuses the exact ASSIGNABLE_TEAM_ROLES + isActive definition SubscriptionsService.getUsage
   * uses for the tenant's own subscription page, so a platform admin and a tenant owner
   * never see two different numbers for the same thing.
   */
  private async toDto(org: Organization): Promise<AdminOrganizationDto> {
    const [activeMemberCount, ticketCount, feedbackFormCount] = await Promise.all([
      this.prisma.user.count({
        where: { organizationId: org.id, isActive: true, role: { in: [...ASSIGNABLE_TEAM_ROLES] } },
      }),
      this.prisma.ticket.count({ where: { organizationId: org.id } }),
      this.prisma.feedbackForm.count({ where: { organizationId: org.id } }),
    ]);

    return {
      id: org.id,
      name: org.name,
      plan: org.plan as PlanType,
      timezone: org.timezone,
      isSuspended: org.isSuspended,
      activeMemberCount,
      ticketCount,
      feedbackFormCount,
      createdAt: org.createdAt.toISOString(),
    };
  }
}
