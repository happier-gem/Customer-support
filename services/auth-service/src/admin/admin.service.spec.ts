import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ASSIGNABLE_TEAM_ROLES, ORGANIZATION_STATUSES, ROLES, RpcAuthContext } from '@app/shared';
import { AdminService } from './admin.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PlanLimitExceededException } from '../subscriptions/plan-limit.exception';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Integration tests against a real Postgres database (see ../../.env.test), mirroring the
 * pattern used across every other Phase's service spec. Covers Phase 9's own acceptance
 * criteria directly: explicit PLATFORM_ADMIN-only authorization (Step 2/24), platform-vs-
 * tenant context separation (Step 3), pagination/search/filtering (Steps 5/13/29), exact
 * platform statistics (Step 28), suspension security (Step 9), and tenant-seat/analytics
 * isolation (Steps 16-17).
 */
describe('AdminService (integration — platform-admin authorization + cross-tenant visibility)', () => {
  let service: AdminService;
  let subscriptions: SubscriptionsService;
  let prisma: PrismaService;

  let orgA: { id: string; name: string };
  let orgB: { id: string; name: string };
  let platformOrg: { id: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let ownerB: RpcAuthContext;
  let platformAdmin: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [AdminService, SubscriptionsService, NotificationsService, PrismaService],
    }).compile();

    service = moduleRef.get(AdminService);
    subscriptions = moduleRef.get(SubscriptionsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  const passwordHash$ = argon2.hash('SomePassword1');

  async function mkOrg(name: string, plan: 'FREE' | 'STARTER' | 'PRO' = 'PRO') {
    return prisma.organization.create({ data: { name, plan } });
  }

  async function mkUser(organizationId: string, name: string, role: string, isActive = true) {
    return prisma.user.create({
      data: {
        organizationId,
        name,
        email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2)}@test.local`,
        passwordHash: await passwordHash$,
        role: role as never,
        emailVerified: true,
        isActive,
      },
    });
  }

  function ctx(u: { id: string; email: string }, organizationId: string, role: string): RpcAuthContext {
    return { userId: u.id, email: u.email, organizationId, role: role as never };
  }

  beforeEach(async () => {
    await prisma.organization.deleteMany({});

    orgA = await mkOrg('Acme Corp', 'FREE');
    orgB = await mkOrg('Globex Inc', 'PRO');
    platformOrg = await mkOrg('Platform');

    const [userOwnerA, userAgentA, userCustomerA, userOwnerB, userAdmin] = await Promise.all([
      mkUser(orgA.id, 'Owner A', ROLES.TENANT_OWNER),
      mkUser(orgA.id, 'Agent A', ROLES.SUPPORT_AGENT),
      mkUser(orgA.id, 'Customer A', ROLES.CUSTOMER),
      mkUser(orgB.id, 'Owner B', ROLES.TENANT_OWNER),
      mkUser(platformOrg.id, 'Platform Admin', ROLES.PLATFORM_ADMIN),
    ]);

    ownerA = ctx(userOwnerA, orgA.id, ROLES.TENANT_OWNER);
    agentA = ctx(userAgentA, orgA.id, ROLES.SUPPORT_AGENT);
    customerA = ctx(userCustomerA, orgA.id, ROLES.CUSTOMER);
    ownerB = ctx(userOwnerB, orgB.id, ROLES.TENANT_OWNER);
    platformAdmin = ctx(userAdmin, platformOrg.id, ROLES.PLATFORM_ADMIN);
  });

  // ---------------------------------------------------------------------
  // Explicit role authorization (Step 2, Step 24)
  // ---------------------------------------------------------------------
  describe('authorization', () => {
    it('a platform admin can list organizations', async () => {
      await expect(service.listOrganizations(platformAdmin, {})).resolves.toBeDefined();
    });

    it('a tenant owner cannot list organizations', async () => {
      await expect(service.listOrganizations(ownerA, {})).rejects.toThrow(ForbiddenException);
    });

    it('a support agent cannot list organizations', async () => {
      await expect(service.listOrganizations(agentA, {})).rejects.toThrow(ForbiddenException);
    });

    it('a customer cannot list organizations', async () => {
      await expect(service.listOrganizations(customerA, {})).rejects.toThrow(ForbiddenException);
    });

    it('only a platform admin can view organization detail', async () => {
      await expect(service.getOrganization(platformAdmin, orgA.id)).resolves.toBeDefined();
      await expect(service.getOrganization(ownerA, orgA.id)).rejects.toThrow(ForbiddenException);
      await expect(service.getOrganization(agentA, orgA.id)).rejects.toThrow(ForbiddenException);
      await expect(service.getOrganization(customerA, orgA.id)).rejects.toThrow(ForbiddenException);
    });

    it('only a platform admin can suspend/activate an organization', async () => {
      await expect(service.setSuspended(ownerA, orgA.id, true)).rejects.toThrow(ForbiddenException);
      await expect(service.setSuspended(agentA, orgA.id, true)).rejects.toThrow(ForbiddenException);
      await expect(service.setSuspended(customerA, orgA.id, true)).rejects.toThrow(ForbiddenException);
      await expect(service.setSuspended(platformAdmin, orgA.id, true)).resolves.toBeDefined();
    });

    it('only a platform admin can view platform stats or the plan catalog', async () => {
      await expect(service.getPlatformStats(ownerA)).rejects.toThrow(ForbiddenException);
      await expect(service.getPlatformStats(platformAdmin)).resolves.toBeDefined();

      await expect(service.listPlans(ownerA)).rejects.toThrow(ForbiddenException);
      await expect(service.listPlans(platformAdmin)).resolves.toBeDefined();
    });

    it('a tenant owner cannot escalate by claiming a spoofed organizationId in their own authContext', async () => {
      // Even if a caller's authContext.organizationId were somehow orgB.id, role is what
      // gates every admin method — there is no code path here that trusts organizationId
      // as an authorization signal the way tenant-scoped services do.
      const spoofed: RpcAuthContext = { ...ownerA, organizationId: orgB.id };
      await expect(service.listOrganizations(spoofed, {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------
  // Cross-tenant visibility is the *point* here (Step 3, Step 25) — unlike every
  // tenant-scoped service, AdminService never filters by authContext.organizationId.
  // ---------------------------------------------------------------------
  describe('platform-level (not tenant-scoped) visibility', () => {
    it('a platform admin sees every organization, not just their own placeholder org', async () => {
      const result = await service.listOrganizations(platformAdmin, { pageSize: 100 });
      const ids = result.data.map((o) => o.id);
      expect(ids).toEqual(expect.arrayContaining([orgA.id, orgB.id, platformOrg.id]));
    });

    it('organization detail returns real database data — name, plan, timezone, counts, created date', async () => {
      await mkUser(orgA.id, 'Extra Agent', ROLES.SUPPORT_AGENT);
      await prisma.ticket.create({
        data: { organizationId: orgA.id, customerId: (await mkUser(orgA.id, 'Ticket Customer', ROLES.CUSTOMER)).id, title: 't', description: 'd' },
      });

      const detail = await service.getOrganization(platformAdmin, orgA.id);
      expect(detail.id).toBe(orgA.id);
      expect(detail.name).toBe('Acme Corp');
      expect(detail.plan).toBe('FREE');
      expect(detail.isSuspended).toBe(false);
      expect(detail.activeMemberCount).toBe(3); // Owner A, Agent A, Extra Agent — CUSTOMER role excluded
      expect(detail.ticketCount).toBe(1);
      expect(detail.feedbackFormCount).toBe(0);
      expect(detail.createdAt).toBeDefined();
    });

    it('a nonexistent organization id resolves as not found', async () => {
      await expect(service.getOrganization(platformAdmin, 'not-a-real-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // Pagination, search, filtering (Steps 5, 13, 29 — always database-level)
  // ---------------------------------------------------------------------
  describe('listOrganizations — pagination, search, filters', () => {
    it('paginates with an exact total count', async () => {
      for (let i = 0; i < 10; i++) await mkOrg(`Extra Org ${i}`, 'FREE');

      const page1 = await service.listOrganizations(platformAdmin, { page: 1, pageSize: 10 });
      expect(page1.data).toHaveLength(10);
      expect(page1.pagination.total).toBe(13); // orgA, orgB, platformOrg + 10 extra

      const page2 = await service.listOrganizations(platformAdmin, { page: 2, pageSize: 10 });
      expect(page2.data).toHaveLength(3);

      const idsPage1 = new Set(page1.data.map((o) => o.id));
      for (const org of page2.data) expect(idsPage1.has(org.id)).toBe(false);
    });

    it('search matches by organization name, database-side, case-insensitively', async () => {
      const result = await service.listOrganizations(platformAdmin, { search: 'acme' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(orgA.id);
    });

    it('filters by plan', async () => {
      const result = await service.listOrganizations(platformAdmin, { plan: 'PRO' });
      const ids = result.data.map((o) => o.id);
      expect(ids).toContain(orgB.id);
      expect(ids).not.toContain(orgA.id);
    });

    it('filters by status (active vs suspended)', async () => {
      await service.setSuspended(platformAdmin, orgA.id, true);

      const suspended = await service.listOrganizations(platformAdmin, { status: ORGANIZATION_STATUSES.SUSPENDED });
      expect(suspended.data.map((o) => o.id)).toEqual([orgA.id]);

      const active = await service.listOrganizations(platformAdmin, { status: ORGANIZATION_STATUSES.ACTIVE, pageSize: 100 });
      const activeIds = active.data.map((o) => o.id);
      expect(activeIds).not.toContain(orgA.id);
      expect(activeIds).toContain(orgB.id);
    });
  });

  // ---------------------------------------------------------------------
  // Suspension / activation (Steps 8-9)
  // ---------------------------------------------------------------------
  describe('suspend / activate', () => {
    it('suspending sets isSuspended true and persists it', async () => {
      const result = await service.setSuspended(platformAdmin, orgA.id, true);
      expect(result.isSuspended).toBe(true);

      const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgA.id } });
      expect(org.isSuspended).toBe(true);
    });

    it('activating clears isSuspended', async () => {
      await service.setSuspended(platformAdmin, orgA.id, true);
      const result = await service.setSuspended(platformAdmin, orgA.id, false);
      expect(result.isSuspended).toBe(false);
    });

    it('suspending one organization does not affect another', async () => {
      await service.setSuspended(platformAdmin, orgA.id, true);
      const orgBDetail = await service.getOrganization(platformAdmin, orgB.id);
      expect(orgBDetail.isSuspended).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // Plan visibility (Step 7, Step 27)
  // ---------------------------------------------------------------------
  describe('plan visibility', () => {
    it('returns the FREE/STARTER/PRO catalog with their current (DB-backed) limits', async () => {
      const plans = await service.listPlans(platformAdmin);
      const planNames = plans.map((p) => p.plan);
      expect(planNames).toEqual(['FREE', 'STARTER', 'PRO']);
      expect(plans.find((p) => p.plan === 'FREE')?.limits).toEqual({ teamMembers: 2, monthlyTickets: 50, feedbackForms: 0 });
    });
  });

  // ---------------------------------------------------------------------
  // Plan limit editing (Phase 10)
  // ---------------------------------------------------------------------
  describe('updatePlanLimits', () => {
    afterEach(async () => {
      // These rows are global (not org-scoped, never touched by the
      // organization.deleteMany() reset elsewhere), so any test that
      // mutates them must restore the defaults or it leaks into every
      // other spec file sharing this test database.
      await prisma.planLimit.update({
        where: { plan: 'STARTER' },
        data: { teamMembers: 10, monthlyTickets: 500, feedbackForms: 5 },
      });
    });

    it('lets a platform admin change a plan limit, reflected immediately in listPlans()', async () => {
      const updated = await service.updatePlanLimits(platformAdmin, 'STARTER', {
        teamMembers: 25,
        monthlyTickets: 500,
        feedbackForms: 5,
      });
      expect(updated.limits.teamMembers).toBe(25);

      const plans = await service.listPlans(platformAdmin);
      expect(plans.find((p) => p.plan === 'STARTER')?.limits.teamMembers).toBe(25);
    });

    it('accepts null to mean unlimited', async () => {
      const updated = await service.updatePlanLimits(platformAdmin, 'STARTER', {
        teamMembers: null,
        monthlyTickets: 500,
        feedbackForms: 5,
      });
      expect(updated.limits.teamMembers).toBeNull();
    });

    it('rejects a non-platform-admin', async () => {
      await expect(
        service.updatePlanLimits(ownerA, 'STARTER', { teamMembers: 25, monthlyTickets: 500, feedbackForms: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a changed limit is actually enforced for organizations on that plan', async () => {
      await service.updatePlanLimits(platformAdmin, 'FREE', { teamMembers: 1, monthlyTickets: 50, feedbackForms: 0 });
      try {
        // orgA is FREE with 2 pre-seeded members (owner + agent) from the outer beforeEach —
        // already over the newly-lowered limit of 1, so adding a team member must now be blocked.
        await expect(subscriptions.assertCanAddTeamMember(prisma, orgA.id)).rejects.toThrow(PlanLimitExceededException);
      } finally {
        await prisma.planLimit.update({ where: { plan: 'FREE' }, data: { teamMembers: 2, monthlyTickets: 50, feedbackForms: 0 } });
      }
    });
  });

  // ---------------------------------------------------------------------
  // Platform-level analytics — exact numbers (Step 28)
  // ---------------------------------------------------------------------
  describe('platform statistics', () => {
    it('computes exact organization/plan/usage totals from real data', async () => {
      // orgA: FREE, 1 active owner + 1 active agent + 1 inactive agent (excluded) + 10 tickets + 1 feedback form
      const inactiveAgent = await mkUser(orgA.id, 'Inactive Agent', ROLES.SUPPORT_AGENT);
      await prisma.user.update({ where: { id: inactiveAgent.id }, data: { isActive: false } });
      const ticketCustomerA = await mkUser(orgA.id, 'Ticket Customer A', ROLES.CUSTOMER);
      for (let i = 0; i < 10; i++) {
        await prisma.ticket.create({ data: { organizationId: orgA.id, customerId: ticketCustomerA.id, title: 't', description: 'd' } });
      }
      await prisma.feedbackForm.create({ data: { organizationId: orgA.id, createdById: ownerA.userId, title: 'Survey' } });

      // orgB: PRO, 1 active owner + 20 tickets
      const ticketCustomerB = await mkUser(orgB.id, 'Ticket Customer B', ROLES.CUSTOMER);
      for (let i = 0; i < 20; i++) {
        await prisma.ticket.create({ data: { organizationId: orgB.id, customerId: ticketCustomerB.id, title: 't', description: 'd' } });
      }

      // A third, suspended org: STARTER, 30 tickets
      const orgC = await mkOrg('Initech', 'STARTER');
      const ownerC = await mkUser(orgC.id, 'Owner C', ROLES.TENANT_OWNER);
      const ticketCustomerC = await mkUser(orgC.id, 'Ticket Customer C', ROLES.CUSTOMER);
      for (let i = 0; i < 30; i++) {
        await prisma.ticket.create({ data: { organizationId: orgC.id, customerId: ticketCustomerC.id, title: 't', description: 'd' } });
      }
      await service.setSuspended(platformAdmin, orgC.id, true);
      void ownerC;

      const stats = await service.getPlatformStats(platformAdmin);

      expect(stats.organizations.total).toBe(4); // orgA, orgB, orgC, platformOrg
      expect(stats.organizations.suspended).toBe(1);
      expect(stats.organizations.active).toBe(3);

      expect(stats.plans.FREE).toBe(1); // orgA
      expect(stats.plans.PRO).toBe(2); // orgB + platformOrg (mkOrg's default plan is PRO)
      expect(stats.plans.STARTER).toBe(1); // orgC

      expect(stats.usage.ticketsThisMonth).toBe(60); // 10 + 20 + 30, all created "now"
      expect(stats.usage.feedbackForms).toBe(1);
      // Active team members: Owner A, Agent A(2 orgs helper doesn't apply here) — computed
      // exactly against ASSIGNABLE_TEAM_ROLES + isActive, matching SubscriptionsService.getUsage.
      const expectedActiveMembers = await prisma.user.count({
        where: { isActive: true, role: { in: [...ASSIGNABLE_TEAM_ROLES] } },
      });
      expect(stats.usage.activeTeamMembers).toBe(expectedActiveMembers);
    });

    it('never mixes tickets/forms into another organization’s admin detail counts', async () => {
      const ticketCustomerA = await mkUser(orgA.id, 'Ticket Customer A', ROLES.CUSTOMER);
      await prisma.ticket.create({ data: { organizationId: orgA.id, customerId: ticketCustomerA.id, title: 't', description: 'd' } });

      const orgBDetail = await service.getOrganization(platformAdmin, orgB.id);
      expect(orgBDetail.ticketCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Platform Admin never becomes a tenant member (Steps 16-17)
  // ---------------------------------------------------------------------
  describe('platform admin isolation from tenant context', () => {
    it('the platform admin’s own organization never appears when scoping by a tenant’s organizationId', async () => {
      // Mirrors how every tenant-scoped service (e.g. MembersService.list) queries —
      // a platform admin belongs to its own placeholder org, structurally invisible to a
      // `WHERE organizationId = orgA.id` query no matter what the caller's role is.
      const orgAUsers = await prisma.user.findMany({ where: { organizationId: orgA.id } });
      expect(orgAUsers.some((u) => u.role === ROLES.PLATFORM_ADMIN)).toBe(false);
    });

    it('platform admin is not counted in orgA’s active-team-member usage', async () => {
      const orgADetail = await service.getOrganization(platformAdmin, orgA.id);
      // Owner A + Agent A only — the platform admin belongs to a different organization
      // entirely, so it can never be counted here regardless of role-based logic elsewhere.
      expect(orgADetail.activeMemberCount).toBe(2);
    });
  });
});
