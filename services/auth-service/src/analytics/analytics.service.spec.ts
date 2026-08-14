import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ROLES, RpcAuthContext, TICKET_HISTORY_ACTIONS, TICKET_STATUSES } from '@app/shared';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Integration tests against a real Postgres database (see ../../.env.test), mirroring
 * subscriptions.service.spec.ts. All data is seeded directly via Prisma with explicit
 * timestamps/actors so every expected number is exact and independent of other services'
 * business logic (see Phase 7 assignment Steps 15-20: exact-value accuracy + tenant
 * isolation, not just "returns something non-null").
 */
describe('AnalyticsService (integration — tenant isolation + accuracy)', () => {
  let analytics: AnalyticsService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: RpcAuthContext;
  let agentA: RpcAuthContext;
  let customerA: RpcAuthContext;
  let ownerB: RpcAuthContext;
  let agentAId: string;
  let customerAId: string;
  let ownerAId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [AnalyticsService, PrismaService],
    }).compile();

    analytics = moduleRef.get(AnalyticsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  const passwordHash$ = argon2.hash('SomePassword1');

  async function mkOrg(name: string, timezone = 'UTC') {
    return prisma.organization.create({ data: { name, timezone } });
  }

  async function mkUser(organizationId: string, name: string, role: string) {
    return prisma.user.create({
      data: {
        organizationId,
        name,
        email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2)}@test.local`,
        passwordHash: await passwordHash$,
        role: role as never,
        emailVerified: true,
      },
    });
  }

  function ctx(u: { id: string; email: string }, organizationId: string, role: string): RpcAuthContext {
    return { userId: u.id, email: u.email, organizationId, role: role as never };
  }

  async function mkTicket(organizationId: string, customerId: string, status: string, createdAt: Date) {
    return prisma.ticket.create({
      data: { organizationId, customerId, title: 't', description: 'd', status: status as never, createdAt },
    });
  }

  async function mkHistory(
    organizationId: string,
    ticketId: string,
    actorId: string,
    action: string,
    createdAt: Date,
  ) {
    return prisma.ticketHistory.create({
      data: { organizationId, ticketId, actorId, action: action as never, createdAt },
    });
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
    ownerAId = userOwnerA.id;
    agentAId = userAgentA.id;
    customerAId = userCustomerA.id;
  });

  // ---------------------------------------------------------------------
  // Role security (Step 14)
  // ---------------------------------------------------------------------
  describe('role security', () => {
    it('a tenant owner can view their own analytics', async () => {
      await expect(analytics.getOverview(ownerA)).resolves.toBeDefined();
    });

    it('a support agent cannot view analytics', async () => {
      await expect(analytics.getOverview(agentA)).rejects.toThrow(ForbiddenException);
    });

    it('a customer cannot view analytics', async () => {
      await expect(analytics.getOverview(customerA)).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------
  // Empty state (Step 13)
  // ---------------------------------------------------------------------
  describe('empty state', () => {
    it('an org with no tickets/feedback returns null averages and zero counts, never fake zeros for the averages', async () => {
      const result = await analytics.getOverview(ownerA);
      expect(result.ticketsCreatedPerMonth).toHaveLength(12);
      expect(result.ticketsCreatedPerMonth.every((m) => m.count === 0)).toBe(true);
      expect(result.averageResponseTimeMinutes).toBeNull();
      expect(result.customerSatisfactionScore).toBeNull();
      expect(result.openTickets).toBe(0);
      expect(result.closedTickets).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Tickets created per month + tenant isolation (Steps 15-16)
  // ---------------------------------------------------------------------
  describe('tickets created per month', () => {
    it('counts only the caller org’s tickets, bucketed by real createdAt month, and never leaks another tenant’s numbers', async () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth(); // 0-indexed "this" month

      const janA = new Date(Date.UTC(y, m - 2, 15, 12, 0, 0));
      const febA = new Date(Date.UTC(y, m - 1, 15, 12, 0, 0));
      const marA = new Date(Date.UTC(y, m, 15, 12, 0, 0));

      await Promise.all([
        ...Array.from({ length: 3 }, () => mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, janA)),
        ...Array.from({ length: 5 }, () => mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, febA)),
        ...Array.from({ length: 7 }, () => mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, marA)),
      ]);

      // Org B: 100 tickets in the same "January" bucket — must never bleed into Org A's count.
      const ownerBUser = await prisma.user.findFirstOrThrow({ where: { organizationId: orgB.id } });
      await Promise.all(
        Array.from({ length: 100 }, () => mkTicket(orgB.id, ownerBUser.id, TICKET_STATUSES.OPEN, janA)),
      );

      const resultA = await analytics.getOverview(ownerA);
      const byMonth = new Map(resultA.ticketsCreatedPerMonth.map((r) => [r.month, r.count]));
      const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

      expect(byMonth.get(key(janA))).toBe(3); // NOT 103
      expect(byMonth.get(key(febA))).toBe(5);
      expect(byMonth.get(key(marA))).toBe(7);

      const resultB = await analytics.getOverview(ownerB);
      const byMonthB = new Map(resultB.ticketsCreatedPerMonth.map((r) => [r.month, r.count]));
      expect(byMonthB.get(key(janA))).toBe(100);
      expect(byMonthB.get(key(febA))).toBe(0);
    });

    it('always returns exactly 12 buckets, oldest first, ending at the current month', async () => {
      const result = await analytics.getOverview(ownerA);
      const now = new Date();
      const expectedLastKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      expect(result.ticketsCreatedPerMonth).toHaveLength(12);
      expect(result.ticketsCreatedPerMonth[11].month).toBe(expectedLastKey);
    });

    it("respects the organization's configured timezone at the month boundary, not naive UTC", async () => {
      // A ticket timestamped just after UTC midnight on the 1st is already "next month" in
      // Asia/Kolkata (UTC+5:30), which crossed the boundary 5.5 hours earlier — mirrors
      // subscriptions.service.spec.ts's identical Phase 6 month-boundary test.
      await prisma.organization.update({ where: { id: orgA.id }, data: { timezone: 'Asia/Kolkata' } });
      const now = new Date();
      const firstOfMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 30, 0));
      await mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, firstOfMonthUtc);

      const result = await analytics.getOverview(ownerA);
      const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = result.ticketsCreatedPerMonth.find((b) => b.month === key);
      expect(bucket?.count).toBe(1);
    });
  });

  // ---------------------------------------------------------------------
  // Average response time (Step 17)
  // ---------------------------------------------------------------------
  describe('average response time', () => {
    it('computes the exact average minutes from ticket creation to the first SUPPORT_AGENT history event', async () => {
      const t1Created = new Date('2026-06-01T10:00:00Z');
      const t1Response = new Date('2026-06-01T10:30:00Z'); // 30 minutes
      const t2Created = new Date('2026-06-01T11:00:00Z');
      const t2Response = new Date('2026-06-01T12:00:00Z'); // 60 minutes

      const t1 = await mkTicket(orgA.id, customerAId, TICKET_STATUSES.IN_PROGRESS, t1Created);
      await mkHistory(orgA.id, t1.id, customerAId, TICKET_HISTORY_ACTIONS.CREATED, t1Created);
      await mkHistory(orgA.id, t1.id, agentAId, TICKET_HISTORY_ACTIONS.STATUS_CHANGED, t1Response);

      const t2 = await mkTicket(orgA.id, customerAId, TICKET_STATUSES.IN_PROGRESS, t2Created);
      await mkHistory(orgA.id, t2.id, customerAId, TICKET_HISTORY_ACTIONS.CREATED, t2Created);
      await mkHistory(orgA.id, t2.id, agentAId, TICKET_HISTORY_ACTIONS.STATUS_CHANGED, t2Response);

      const result = await analytics.getOverview(ownerA);
      expect(result.averageResponseTimeMinutes).toBe(45); // (30 + 60) / 2
    });

    it('excludes tickets with no agent response from the average rather than counting them as 0', async () => {
      const created = new Date('2026-06-01T10:00:00Z');
      const responded = new Date('2026-06-01T10:20:00Z'); // 20 minutes

      const responded1 = await mkTicket(orgA.id, customerAId, TICKET_STATUSES.IN_PROGRESS, created);
      await mkHistory(orgA.id, responded1.id, agentAId, TICKET_HISTORY_ACTIONS.STATUS_CHANGED, responded);

      // No agent history at all — must not drag the average toward 0.
      await mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, created);

      const result = await analytics.getOverview(ownerA);
      expect(result.averageResponseTimeMinutes).toBe(20);
    });

    it('an owner assigning a ticket (not the agent acting) does not count as the agent’s response', async () => {
      const created = new Date('2026-06-01T10:00:00Z');
      const ownerAssigns = new Date('2026-06-01T10:05:00Z');

      const ticket = await mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, created);
      await mkHistory(orgA.id, ticket.id, ownerAId, TICKET_HISTORY_ACTIONS.ASSIGNED, ownerAssigns);

      const result = await analytics.getOverview(ownerA);
      expect(result.averageResponseTimeMinutes).toBeNull();
    });

    it('never mixes another organization’s tickets into the average', async () => {
      const ownerBUser = await prisma.user.findFirstOrThrow({ where: { organizationId: orgB.id } });
      const bCreated = new Date('2026-06-01T00:00:00Z');
      const bTicket = await mkTicket(orgB.id, ownerBUser.id, TICKET_STATUSES.OPEN, bCreated);
      await mkHistory(orgB.id, bTicket.id, ownerBUser.id, TICKET_HISTORY_ACTIONS.STATUS_CHANGED, new Date('2026-06-01T05:00:00Z'));

      const result = await analytics.getOverview(ownerA);
      expect(result.averageResponseTimeMinutes).toBeNull(); // Org A has no tickets of its own
    });
  });

  // ---------------------------------------------------------------------
  // Customer satisfaction (Step 18)
  // ---------------------------------------------------------------------
  describe('customer satisfaction score', () => {
    async function mkFormWithQuestions(organizationId: string, creatorId: string) {
      const form = await prisma.feedbackForm.create({
        data: { organizationId, createdById: creatorId, title: 'Survey', status: 'ACTIVE' },
      });
      const ratingQ = await prisma.feedbackQuestion.create({
        data: { organizationId, formId: form.id, type: 'RATING', label: 'Rate us', order: 0 },
      });
      const textQ = await prisma.feedbackQuestion.create({
        data: { organizationId, formId: form.id, type: 'TEXT', label: 'Comments', order: 1, required: false },
      });
      return { form, ratingQ, textQ };
    }

    async function mkResponse(
      organizationId: string,
      formId: string,
      customerId: string,
      ratingQId: string,
      ratingValue: number,
      textQId?: string,
      textValue?: string,
    ) {
      const response = await prisma.feedbackResponse.create({ data: { organizationId, formId, customerId } });
      await prisma.feedbackAnswer.create({
        data: { organizationId, responseId: response.id, questionId: ratingQId, ratingValue },
      });
      if (textQId) {
        await prisma.feedbackAnswer.create({
          data: { organizationId, responseId: response.id, questionId: textQId, textValue },
        });
      }
      return response;
    }

    it('averages only RATING answers, exactly, and text answers never affect the score', async () => {
      const { form, ratingQ, textQ } = await mkFormWithQuestions(orgA.id, ownerAId);
      const ratings = [5, 4, 5, 3, 3]; // avg = 4.0
      for (const r of ratings) {
        await mkResponse(orgA.id, form.id, customerAId, ratingQ.id, r, textQ.id, 'irrelevant text, must not shift the average');
      }

      const result = await analytics.getOverview(ownerA);
      expect(result.customerSatisfactionScore).toBe(4.0);
    });

    it('feedback from another organization never contributes to the caller’s score', async () => {
      const ownerBUser = await prisma.user.findFirstOrThrow({ where: { organizationId: orgB.id } });
      const { form: formA, ratingQ: ratingQA } = await mkFormWithQuestions(orgA.id, ownerAId);
      await mkResponse(orgA.id, formA.id, customerAId, ratingQA.id, 5);

      const { form: formB, ratingQ: ratingQB } = await mkFormWithQuestions(orgB.id, ownerBUser.id);
      await mkResponse(orgB.id, formB.id, ownerBUser.id, ratingQB.id, 1);

      const resultA = await analytics.getOverview(ownerA);
      expect(resultA.customerSatisfactionScore).toBe(5); // unaffected by Org B's rating of 1

      const resultB = await analytics.getOverview(ownerB);
      expect(resultB.customerSatisfactionScore).toBe(1);
    });

    it('returns null (not 0) when there are no rating answers yet', async () => {
      const { form, textQ } = await mkFormWithQuestions(orgA.id, ownerAId);
      const response = await prisma.feedbackResponse.create({
        data: { organizationId: orgA.id, formId: form.id, customerId: customerAId },
      });
      await prisma.feedbackAnswer.create({
        data: { organizationId: orgA.id, responseId: response.id, questionId: textQ.id, textValue: 'only text' },
      });

      const result = await analytics.getOverview(ownerA);
      expect(result.customerSatisfactionScore).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Open vs closed (Step 19)
  // ---------------------------------------------------------------------
  describe('open vs closed ticket counts', () => {
    it('CLOSED tickets are "closed"; every other status counts as "open" — exact counts', async () => {
      const now = new Date();
      const statuses = [
        ...Array(3).fill(TICKET_STATUSES.OPEN),
        ...Array(2).fill(TICKET_STATUSES.IN_PROGRESS),
        ...Array(1).fill(TICKET_STATUSES.WAITING_FOR_CUSTOMER),
        ...Array(4).fill(TICKET_STATUSES.RESOLVED),
        ...Array(5).fill(TICKET_STATUSES.CLOSED),
      ];
      await Promise.all(statuses.map((s) => mkTicket(orgA.id, customerAId, s, now)));

      const result = await analytics.getOverview(ownerA);
      expect(result.openTickets).toBe(10); // 3 + 2 + 1 + 4
      expect(result.closedTickets).toBe(5);
    });

    it('never mixes another organization’s ticket counts into the caller’s totals', async () => {
      const ownerBUser = await prisma.user.findFirstOrThrow({ where: { organizationId: orgB.id } });
      await mkTicket(orgA.id, customerAId, TICKET_STATUSES.OPEN, new Date());
      await Promise.all(
        Array.from({ length: 20 }, () => mkTicket(orgB.id, ownerBUser.id, TICKET_STATUSES.CLOSED, new Date())),
      );

      const resultA = await analytics.getOverview(ownerA);
      expect(resultA.openTickets).toBe(1);
      expect(resultA.closedTickets).toBe(0);
    });
  });
});
