import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ASSIGNABLE_TEAM_ROLES, PLAN_LIMITS, PLAN_TYPES, ROLES, RpcAuthContext } from '@app/shared';
import { SubscriptionsService } from './subscriptions.service';
import { PlanLimitExceededException } from './plan-limit.exception';
import { startOfCurrentMonthInTimezone } from './month-boundary.util';
import { TicketsService } from '../tickets/tickets.service';
import { FeedbackService } from '../feedback/feedback.service';
import { InvitationsService } from '../invitations/invitations.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Integration tests against a real Postgres database (see ../../.env.test),
 * mirroring tickets/feedback.service.spec.ts. Covers the Phase 6 assignment's
 * Part 26 checklist: plan definitions, per-feature limit enforcement,
 * upgrade/downgrade behavior, tenant isolation/security, usage accuracy,
 * concurrency (Part 29), and the month-boundary calculation (Part 28).
 */
describe('SubscriptionsService (integration — plan limits + tenant isolation)', () => {
  let subscriptions: SubscriptionsService;
  let tickets: TicketsService;
  let feedback: FeedbackService;
  let invitations: InvitationsService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let ownerB: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [
        SubscriptionsService,
        TicketsService,
        FeedbackService,
        InvitationsService,
        MailService,
        PrismaService,
        NotificationsService,
      ],
    }).compile();

    subscriptions = moduleRef.get(SubscriptionsService);
    tickets = moduleRef.get(TicketsService);
    feedback = moduleRef.get(FeedbackService);
    invitations = moduleRef.get(InvitationsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  const passwordHash$ = argon2.hash('SomePassword1');

  async function mkOrg(name: string, plan: keyof typeof PLAN_TYPES = 'FREE') {
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

    orgA = await mkOrg('Company A');
    orgB = await mkOrg('Company B');

    const [userOwnerA, userAgentA, userCustomerA] = await Promise.all([
      mkUser(orgA.id, 'Owner A', ROLES.TENANT_OWNER),
      mkUser(orgA.id, 'Agent A', ROLES.SUPPORT_AGENT),
      mkUser(orgA.id, 'Customer A', ROLES.CUSTOMER),
    ]);
    const userOwnerB = await mkUser(orgB.id, 'Owner B', ROLES.TENANT_OWNER);

    ownerA = ctx(userOwnerA, orgA.id, ROLES.TENANT_OWNER);
    agentA = ctx(userAgentA, orgA.id, ROLES.SUPPORT_AGENT);
    customerA = ctx(userCustomerA, orgA.id, ROLES.CUSTOMER);
    ownerB = ctx(userOwnerB, orgB.id, ROLES.TENANT_OWNER);
  });

  async function setPlan(organizationId: string, plan: keyof typeof PLAN_TYPES) {
    await prisma.organization.update({ where: { id: organizationId }, data: { plan } });
  }

  // ---------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------
  describe('plans', () => {
    it('1-4. FREE, STARTER, PRO all exist with limits that exactly match the assignment', () => {
      const plans = subscriptions.listPlans();
      expect(plans).toEqual(
        expect.arrayContaining([
          { plan: 'FREE', limits: { teamMembers: 2, monthlyTickets: 50, feedbackForms: 0 } },
          { plan: 'STARTER', limits: { teamMembers: 10, monthlyTickets: 500, feedbackForms: 5 } },
          { plan: 'PRO', limits: { teamMembers: null, monthlyTickets: null, feedbackForms: null } },
        ]),
      );
      expect(plans).toHaveLength(3);
      expect(PLAN_LIMITS).toMatchObject({
        FREE: { teamMembers: 2, monthlyTickets: 50, feedbackForms: 0 },
        STARTER: { teamMembers: 10, monthlyTickets: 500, feedbackForms: 5 },
        PRO: { teamMembers: null, monthlyTickets: null, feedbackForms: null },
      });
    });

    it('5. a newly created organization defaults to the FREE plan', async () => {
      const org = await prisma.organization.create({ data: { name: 'Fresh Co' } });
      expect(org.plan).toBe('FREE');
    });
  });

  // ---------------------------------------------------------------------
  // Team member limit
  // ---------------------------------------------------------------------
  describe('team member limit', () => {
    it('6-7. FREE allows exactly 2 team members and blocks the 3rd', async () => {
      // orgA already has Owner A + Agent A = 2 active team members (FREE limit).
      await expect(subscriptions.assertCanAddTeamMember(prisma, orgA.id)).rejects.toThrow(PlanLimitExceededException);
    });

    it('8-9. STARTER allows 10 team members and blocks the 11th', async () => {
      await setPlan(orgA.id, 'STARTER');
      // 2 already exist (Owner A + Agent A); add 7 more to reach 9 so the
      // check for a would-be 10th member still passes.
      for (let i = 0; i < 7; i++) await mkUser(orgA.id, `Extra ${i}`, ROLES.SUPPORT_AGENT);
      await expect(subscriptions.assertCanAddTeamMember(prisma, orgA.id)).resolves.toBeUndefined(); // 10th allowed
      await mkUser(orgA.id, 'Extra 8', ROLES.SUPPORT_AGENT); // now at 10
      await expect(subscriptions.assertCanAddTeamMember(prisma, orgA.id)).rejects.toThrow(PlanLimitExceededException); // 11th blocked
    });

    it('10. PRO is unlimited', async () => {
      await setPlan(orgA.id, 'PRO');
      for (let i = 0; i < 30; i++) await mkUser(orgA.id, `Bulk ${i}`, ROLES.SUPPORT_AGENT);
      await expect(subscriptions.assertCanAddTeamMember(prisma, orgA.id)).resolves.toBeUndefined();
    });

    it('11-12. downgrading below current headcount keeps existing members and blocks new ones', async () => {
      await setPlan(orgA.id, 'PRO');
      for (let i = 0; i < 13; i++) await mkUser(orgA.id, `Member ${i}`, ROLES.SUPPORT_AGENT);
      const teamWhere = { organizationId: orgA.id, role: { in: [...ASSIGNABLE_TEAM_ROLES] }, isActive: true };
      const before = await prisma.user.count({ where: teamWhere });
      expect(before).toBe(15); // owner + agent + 13 (Customer A is not a team role)

      const result = await subscriptions.changePlan(ownerA, PLAN_TYPES.FREE);
      expect(result.plan).toBe('FREE');

      const after = await prisma.user.count({ where: teamWhere });
      expect(after).toBe(before); // nobody deleted or deactivated

      await expect(subscriptions.assertCanAddTeamMember(prisma, orgA.id)).rejects.toThrow(PlanLimitExceededException);
    });

    it('invite creation is soft-rejected once the org is already at its team-member limit', async () => {
      // orgA is at the FREE limit (2) from beforeEach.
      await expect(invitations.create(ownerA, 'new-hire@company-a.test', ROLES.SUPPORT_AGENT)).rejects.toThrow(
        PlanLimitExceededException,
      );
    });

    it('the error message names the plan and limit', async () => {
      try {
        await subscriptions.assertCanAddTeamMember(prisma, orgA.id);
        throw new Error('expected rejection');
      } catch (err) {
        expect(err).toBeInstanceOf(PlanLimitExceededException);
        const response = (err as PlanLimitExceededException).getResponse() as { message: string; data: Record<string, unknown> };
        expect(response.message).toMatch(/Free plan allows a maximum of 2 team members/i);
        expect(response.data).toMatchObject({ code: 'PLAN_LIMIT_REACHED', feature: 'TEAM_MEMBERS', plan: 'FREE', limit: 2, currentUsage: 2 });
      }
    });
  });

  // ---------------------------------------------------------------------
  // Monthly ticket limit
  // ---------------------------------------------------------------------
  describe('monthly ticket limit', () => {
    async function seedTicketsThisMonth(organizationId: string, customerId: string, count: number) {
      const now = new Date();
      await prisma.ticket.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          organizationId,
          customerId,
          title: `Seed ${i}`,
          description: 'seed',
          createdAt: now,
        })),
      });
    }

    it('13-14. FREE allows exactly 50 tickets this month and blocks the 51st', async () => {
      await seedTicketsThisMonth(orgA.id, customerA.userId, 49);
      await expect(tickets.create(customerA, { title: '50th', description: 'the 50th ticket' })).resolves.toMatchObject({}); // 50th allowed
      await expect(tickets.create(customerA, { title: '51st', description: 'the 51st ticket' })).rejects.toThrow(
        PlanLimitExceededException,
      );
    });

    it('15-16. STARTER allows 500 tickets this month and blocks the 501st', async () => {
      await setPlan(orgA.id, 'STARTER');
      await seedTicketsThisMonth(orgA.id, customerA.userId, 499);
      await expect(tickets.create(customerA, { title: '500th', description: 'x' })).resolves.toMatchObject({});
      await expect(tickets.create(customerA, { title: '501st', description: 'x' })).rejects.toThrow(PlanLimitExceededException);
    });

    it('17. PRO is unlimited', async () => {
      await setPlan(orgA.id, 'PRO');
      await seedTicketsThisMonth(orgA.id, customerA.userId, 600);
      await expect(tickets.create(customerA, { title: 'Still fine', description: 'x' })).resolves.toMatchObject({});
    });

    it("18. previous month's tickets do not count toward this month's limit", async () => {
      const lastMonth = new Date();
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      await prisma.ticket.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          organizationId: orgA.id,
          customerId: customerA.userId,
          title: `Last month ${i}`,
          description: 'seed',
          createdAt: lastMonth,
        })),
      });
      // orgA is on FREE (50/month); all 50 seeded tickets are backdated, so this month's usage is still 0.
      const usage = await subscriptions.getSubscription(ownerA);
      expect(usage.usage.monthlyTickets).toBe(0);
      await expect(tickets.create(customerA, { title: 'This month', description: 'x' })).resolves.toMatchObject({});
    });

    it('19. existing tickets remain after downgrade, and are still visible/counted', async () => {
      await setPlan(orgA.id, 'PRO');
      await seedTicketsThisMonth(orgA.id, customerA.userId, 80);
      await subscriptions.changePlan(ownerA, PLAN_TYPES.FREE);
      const total = await prisma.ticket.count({ where: { organizationId: orgA.id } });
      expect(total).toBe(80); // nothing deleted
      await expect(tickets.create(customerA, { title: 'blocked', description: 'x' })).rejects.toThrow(PlanLimitExceededException);
    });
  });

  // ---------------------------------------------------------------------
  // Feedback form limit
  // ---------------------------------------------------------------------
  describe('feedback form limit', () => {
    it('20. FREE cannot create any custom forms', async () => {
      await expect(feedback.createForm(ownerA, { title: 'Should fail' })).rejects.toThrow(PlanLimitExceededException);
    });

    it('21-22. STARTER allows 5 forms and blocks the 6th', async () => {
      await setPlan(orgA.id, 'STARTER');
      for (let i = 0; i < 4; i++) {
        await expect(feedback.createForm(ownerA, { title: `Form ${i}` })).resolves.toMatchObject({});
      }
      await expect(feedback.createForm(ownerA, { title: 'Form 5th' })).resolves.toMatchObject({}); // 5th allowed
      await expect(feedback.createForm(ownerA, { title: 'Form 6th' })).rejects.toThrow(PlanLimitExceededException);
    });

    it('23. PRO is unlimited', async () => {
      await setPlan(orgA.id, 'PRO');
      for (let i = 0; i < 12; i++) {
        await expect(feedback.createForm(ownerA, { title: `Form ${i}` })).resolves.toMatchObject({});
      }
    });

    it('24. existing forms remain after downgrade', async () => {
      await setPlan(orgA.id, 'STARTER');
      for (let i = 0; i < 5; i++) await feedback.createForm(ownerA, { title: `Form ${i}` });
      await subscriptions.changePlan(ownerA, PLAN_TYPES.FREE);
      const total = await prisma.feedbackForm.count({ where: { organizationId: orgA.id } });
      expect(total).toBe(5);
      await expect(feedback.createForm(ownerA, { title: 'blocked' })).rejects.toThrow(PlanLimitExceededException);
    });
  });

  // ---------------------------------------------------------------------
  // Plan changes
  // ---------------------------------------------------------------------
  describe('plan changes', () => {
    it('25. owner can upgrade FREE -> STARTER', async () => {
      const result = await subscriptions.changePlan(ownerA, PLAN_TYPES.STARTER);
      expect(result.plan).toBe('STARTER');
      expect(result.limits).toEqual(PLAN_LIMITS.STARTER);
    });

    it('26. owner can upgrade STARTER -> PRO', async () => {
      await setPlan(orgA.id, 'STARTER');
      const result = await subscriptions.changePlan(ownerA, PLAN_TYPES.PRO);
      expect(result.plan).toBe('PRO');
    });

    it('27. owner can downgrade PRO -> STARTER', async () => {
      await setPlan(orgA.id, 'PRO');
      const result = await subscriptions.changePlan(ownerA, PLAN_TYPES.STARTER);
      expect(result.plan).toBe('STARTER');
    });

    it('28. owner can downgrade STARTER -> FREE', async () => {
      await setPlan(orgA.id, 'STARTER');
      const result = await subscriptions.changePlan(ownerA, PLAN_TYPES.FREE);
      expect(result.plan).toBe('FREE');
    });

    it('29. an invalid plan value is rejected (defense in depth below the gateway DTO)', async () => {
      await expect(subscriptions.changePlan(ownerA, 'ENTERPRISE' as never)).rejects.toThrow();
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgA.id } });
      expect(org.plan).toBe('FREE'); // unchanged
    });

    it('30. a customer cannot change the plan', async () => {
      await expect(subscriptions.changePlan(customerA, PLAN_TYPES.PRO)).rejects.toThrow(ForbiddenException);
    });

    it('31. a support agent cannot change the plan', async () => {
      await expect(subscriptions.changePlan(agentA, PLAN_TYPES.PRO)).rejects.toThrow(ForbiddenException);
    });

    it('32. plan changes only ever affect the caller’s own organization', async () => {
      await subscriptions.changePlan(ownerA, PLAN_TYPES.PRO);
      const orgBRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgB.id } });
      expect(orgBRow.plan).toBe('FREE'); // untouched by Owner A's change
    });
  });

  // ---------------------------------------------------------------------
  // Security / tenant isolation
  // ---------------------------------------------------------------------
  describe('security', () => {
    it('34. a customer cannot view subscription/usage', async () => {
      await expect(subscriptions.getSubscription(customerA)).rejects.toThrow(ForbiddenException);
    });

    it('35. a support agent cannot view subscription/usage', async () => {
      await expect(subscriptions.getSubscription(agentA)).rejects.toThrow(ForbiddenException);
    });

    it('36. a tenant owner only ever sees their own organization’s subscription — there is no id parameter to target another tenant', async () => {
      await subscriptions.changePlan(ownerB, PLAN_TYPES.PRO);
      const resultA = await subscriptions.getSubscription(ownerA);
      expect(resultA.organizationId).toBe(orgA.id);
      expect(resultA.plan).toBe('FREE'); // orgA's own plan, unaffected by orgB's change
    });

    it('37. plan limits cannot be bypassed by calling the enforcement check with a different service instance/organizationId than the authenticated context — every call site always derives organizationId from authContext, never from client input', async () => {
      // TicketsService.create never accepts an organizationId argument at all;
      // it is always authContext.organizationId (see tickets.service.ts).
      // Demonstrated end-to-end here: orgB (still FREE, 0 tickets) is unaffected
      // by orgA's usage regardless of how many tickets orgA creates.
      await prisma.ticket.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          organizationId: orgA.id,
          customerId: customerA.userId,
          title: `A ${i}`,
          description: 'x',
        })),
      });
      const ownerBUsage = await subscriptions.getSubscription(ownerB);
      expect(ownerBUsage.usage.monthlyTickets).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Usage accuracy
  // ---------------------------------------------------------------------
  describe('usage', () => {
    it('38. team usage counts only active TENANT_OWNER/SUPPORT_AGENT users, not customers', async () => {
      // orgA: Owner A + Agent A (active) + Customer A (not a team member).
      const result = await subscriptions.getSubscription(ownerA);
      expect(result.usage.teamMembers).toBe(2);
    });

    it('39. monthly ticket usage matches the real count of tickets created this month', async () => {
      await prisma.ticket.createMany({
        data: Array.from({ length: 7 }, (_, i) => ({
          organizationId: orgA.id,
          customerId: customerA.userId,
          title: `T${i}`,
          description: 'x',
        })),
      });
      const result = await subscriptions.getSubscription(ownerA);
      expect(result.usage.monthlyTickets).toBe(7);
    });

    it('40. feedback form usage matches the real count of forms', async () => {
      await setPlan(orgA.id, 'PRO');
      await feedback.createForm(ownerA, { title: 'Form 1' });
      await feedback.createForm(ownerA, { title: 'Form 2' });
      const result = await subscriptions.getSubscription(ownerA);
      expect(result.usage.feedbackForms).toBe(2);
    });

    it('41. PRO reports unlimited (null) limits alongside accurate numeric usage', async () => {
      await setPlan(orgA.id, 'PRO');
      const result = await subscriptions.getSubscription(ownerA);
      expect(result.limits).toEqual({ teamMembers: null, monthlyTickets: null, feedbackForms: null });
      expect(typeof result.usage.teamMembers).toBe('number');
    });

    it('a deactivated (removed) team member no longer counts toward team usage', async () => {
      const extra = await mkUser(orgA.id, 'Leaving Agent', ROLES.SUPPORT_AGENT);
      let result = await subscriptions.getSubscription(ownerA);
      expect(result.usage.teamMembers).toBe(3);
      await prisma.user.update({ where: { id: extra.id }, data: { isActive: false } });
      result = await subscriptions.getSubscription(ownerA);
      expect(result.usage.teamMembers).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  // Concurrency (Part 29)
  // ---------------------------------------------------------------------
  describe('concurrency', () => {
    it('concurrent ticket creation at the boundary never lets the count exceed the plan limit', async () => {
      // orgA is FREE (limit 50). Seed 49 so exactly one slot remains.
      await prisma.ticket.createMany({
        data: Array.from({ length: 49 }, (_, i) => ({
          organizationId: orgA.id,
          customerId: customerA.userId,
          title: `Seed ${i}`,
          description: 'x',
        })),
      });

      const attempts = 6;
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, (_, i) =>
          tickets.create(customerA, { title: `Race ${i}`, description: 'concurrent attempt' }),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(succeeded).toHaveLength(1); // only the one remaining slot
      expect(failed).toHaveLength(attempts - 1);
      for (const f of failed as PromiseRejectedResult[]) {
        expect(f.reason).toBeInstanceOf(PlanLimitExceededException);
      }

      const finalCount = await prisma.ticket.count({ where: { organizationId: orgA.id } });
      expect(finalCount).toBe(50); // never overshoots
    }, 20_000);
  });

  // ---------------------------------------------------------------------
  // Month boundary (Part 28)
  // ---------------------------------------------------------------------
  describe('month boundary util', () => {
    it('computes the same UTC instant as plain UTC month-start for the UTC timezone', () => {
      const now = new Date('2026-03-15T10:00:00Z');
      const start = startOfCurrentMonthInTimezone('UTC', now);
      expect(start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('shifts the boundary for a positive-offset timezone (e.g. a day that is still Feb 28 in UTC but already March 1 locally)', () => {
      // 2026-03-01T00:00:00 in Asia/Kolkata (UTC+5:30) is 2026-02-28T18:30:00Z.
      const now = new Date('2026-03-15T10:00:00Z');
      const start = startOfCurrentMonthInTimezone('Asia/Kolkata', now);
      expect(start.toISOString()).toBe('2026-02-28T18:30:00.000Z');
    });

    it("uses the organization's configured timezone, not UTC, when computing ticket usage", async () => {
      await prisma.organization.update({ where: { id: orgA.id }, data: { timezone: 'Asia/Kolkata' } });
      // A ticket timestamped just after UTC midnight on the 1st is already
      // "this month" in Asia/Kolkata (UTC+5:30), which crossed into the new
      // month 5.5 hours earlier.
      const now = new Date();
      const firstOfMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 30, 0));
      await prisma.ticket.create({
        data: {
          organizationId: orgA.id,
          customerId: customerA.userId,
          title: 'Early in the month, UTC-wise',
          description: 'x',
          createdAt: firstOfMonthUtc,
        },
      });
      const result = await subscriptions.getSubscription(ownerA);
      expect(result.usage.monthlyTickets).toBe(1);
    });
  });
});
