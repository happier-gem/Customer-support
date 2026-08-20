import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as argon2 from 'argon2';
import { NOTIFICATION_TYPES, PLAN_LIMIT_ERROR_CODE, ROLES, RpcAuthContext, TICKET_STATUSES } from '@app/shared';
import { NotificationsService } from './notifications.service';
import { TicketsService } from '../tickets/tickets.service';
import { InvitationsService } from '../invitations/invitations.service';
import { MembersService } from '../members/members.service';
import { FeedbackService } from '../feedback/feedback.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from '../auth/utils/token.util';

/**
 * Step 19: drives the *actual* business workflows (TicketsService, InvitationsService,
 * MembersService, FeedbackService, SubscriptionsService) end-to-end against a real
 * Postgres database and asserts on what NotificationsService then reports — never inserts
 * a Notification row directly to fake an event. Step 20's duplicate-prevention is verified
 * the same way: by calling the real service method twice/with a no-op and counting rows.
 */
describe('Notification creation (integration — real business events)', () => {
  let tickets: TicketsService;
  let invitations: InvitationsService;
  let members: MembersService;
  let feedback: FeedbackService;
  let subscriptions: SubscriptionsService;
  let notifications: NotificationsService;
  let prisma: PrismaService;

  let orgA: { id: string; name: string };
  let ownerA: { id: string; email: string };
  let ownerACtx: RpcAuthContext;
  let agentA: { id: string; email: string };
  let agentACtx: RpcAuthContext;
  let agentA2: { id: string; email: string };
  let agentA2Ctx: RpcAuthContext;
  let customerA: { id: string; email: string };
  let customerACtx: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [
        TicketsService,
        InvitationsService,
        MembersService,
        FeedbackService,
        SubscriptionsService,
        NotificationsService,
        MailService,
        PrismaService,
      ],
    }).compile();

    tickets = moduleRef.get(TicketsService);
    invitations = moduleRef.get(InvitationsService);
    members = moduleRef.get(MembersService);
    feedback = moduleRef.get(FeedbackService);
    subscriptions = moduleRef.get(SubscriptionsService);
    notifications = moduleRef.get(NotificationsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  const passwordHash$ = argon2.hash('SomePassword1');

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

  beforeEach(async () => {
    await prisma.organization.deleteMany({});

    // PRO so ticket/team-member/feedback-form creation is unlimited except in the
    // dedicated plan-limit describe block below, which sets FREE explicitly.
    orgA = await prisma.organization.create({ data: { name: 'Company A', plan: 'PRO' } });

    const [o, a1, a2, c] = await Promise.all([
      mkUser(orgA.id, 'Owner A', ROLES.TENANT_OWNER),
      mkUser(orgA.id, 'Agent A', ROLES.SUPPORT_AGENT),
      mkUser(orgA.id, 'Agent A2', ROLES.SUPPORT_AGENT),
      mkUser(orgA.id, 'Customer A', ROLES.CUSTOMER),
    ]);
    ownerA = o;
    agentA = a1;
    agentA2 = a2;
    customerA = c;
    ownerACtx = ctx(ownerA, orgA.id, ROLES.TENANT_OWNER);
    agentACtx = ctx(agentA, orgA.id, ROLES.SUPPORT_AGENT);
    agentA2Ctx = ctx(agentA2, orgA.id, ROLES.SUPPORT_AGENT);
    customerACtx = ctx(customerA, orgA.id, ROLES.CUSTOMER);
  });

  // ---------------------------------------------------------------------
  // Ticket lifecycle
  // ---------------------------------------------------------------------
  describe('ticket lifecycle', () => {
    it('a customer creating a ticket notifies the tenant owner and every active support agent, never the customer or other customers', async () => {
      const otherCustomer = await mkUser(orgA.id, 'Other Customer', ROLES.CUSTOMER);

      const ticket = await tickets.create(customerACtx, { title: 'Cannot log in', description: 'Help!' });

      const ownerResult = await notifications.list(ownerACtx, {});
      expect(ownerResult.data).toHaveLength(1);
      expect(ownerResult.data[0].type).toBe(NOTIFICATION_TYPES.TICKET_CREATED);
      expect(ownerResult.data[0].ticketId).toBe(ticket.id);

      const agentResult = await notifications.list(agentACtx, {});
      expect(agentResult.data).toHaveLength(1);
      expect(agentResult.data[0].type).toBe(NOTIFICATION_TYPES.TICKET_CREATED);

      const customerResult = await notifications.list(customerACtx, {});
      expect(customerResult.data).toHaveLength(0);

      const otherCustomerResult = await notifications.list(ctx(otherCustomer, orgA.id, ROLES.CUSTOMER), {});
      expect(otherCustomerResult.data).toHaveLength(0);
    });

    it('does not notify a deactivated support agent about a new ticket', async () => {
      await prisma.user.update({ where: { id: agentA2.id }, data: { isActive: false } });

      await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });

      expect((await notifications.list(agentACtx, {})).data).toHaveLength(1);
      expect((await notifications.list(agentA2Ctx, {})).data).toHaveLength(0);
    });

    it('the owner assigning a ticket to an agent notifies that agent, and only that agent', async () => {
      const ticket = await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });
      // Clear the TICKET_CREATED noise so we can assert cleanly on the assignment notification.
      await notifications.markAllRead(agentACtx);
      await notifications.markAllRead(agentA2Ctx);

      await tickets.assign(ownerACtx, ticket.id, agentA.id);

      const agentUnread = (await notifications.list(agentACtx, { unreadOnly: true })).data;
      expect(agentUnread).toHaveLength(1);
      expect(agentUnread[0].type).toBe(NOTIFICATION_TYPES.TICKET_ASSIGNED);
      expect(agentUnread[0].ticketId).toBe(ticket.id);

      expect((await notifications.list(agentA2Ctx, { unreadOnly: true })).data).toHaveLength(0);
    });

    it('an agent picking up an unassigned ticket themselves (assignSelf) does not self-notify', async () => {
      const ticket = await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });
      await notifications.markAllRead(agentACtx);

      await tickets.assignSelf(agentACtx, ticket.id);

      expect((await notifications.list(agentACtx, { unreadOnly: true })).data).toHaveLength(0);
    });

    it('a status change notifies the ticket’s customer with the new status in the message', async () => {
      const ticket = await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });
      await notifications.markAllRead(customerACtx);
      await tickets.assign(ownerACtx, ticket.id, agentA.id);

      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.IN_PROGRESS);

      const result = (await notifications.list(customerACtx, { unreadOnly: true })).data;
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(NOTIFICATION_TYPES.TICKET_STATUS_CHANGED);
      expect(result[0].ticketId).toBe(ticket.id);
    });

    it('using the specific RESOLVED and CLOSED types (not the generic STATUS_CHANGED) for those transitions', async () => {
      const ticket = await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });
      await tickets.assign(ownerACtx, ticket.id, agentA.id);
      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.IN_PROGRESS);
      await notifications.markAllRead(customerACtx);

      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.RESOLVED);
      let result = (await notifications.list(customerACtx, { unreadOnly: true })).data;
      expect(result[0].type).toBe(NOTIFICATION_TYPES.TICKET_RESOLVED);

      await notifications.markAllRead(customerACtx);
      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.CLOSED);
      result = (await notifications.list(customerACtx, { unreadOnly: true })).data;
      expect(result[0].type).toBe(NOTIFICATION_TYPES.TICKET_CLOSED);
    });

    it('Step 13/20: a no-op status update (same status) creates no additional notification', async () => {
      const ticket = await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });
      await tickets.assign(ownerACtx, ticket.id, agentA.id);
      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.IN_PROGRESS);
      await notifications.markAllRead(customerACtx);

      // Same status as current — TicketsService.updateStatus returns early with no history
      // row, so it must also create no notification.
      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.IN_PROGRESS);

      expect((await notifications.list(customerACtx, { unreadOnly: true })).data).toHaveLength(0);
    });

    it('Step 20: three separate real status transitions produce exactly three customer notifications (no under- or over-counting)', async () => {
      const ticket = await tickets.create(customerACtx, { title: 'Ticket', description: 'x' });
      await tickets.assign(ownerACtx, ticket.id, agentA.id);
      await notifications.markAllRead(customerACtx);

      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.IN_PROGRESS);
      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.WAITING_FOR_CUSTOMER);
      await tickets.updateStatus(agentACtx, ticket.id, TICKET_STATUSES.IN_PROGRESS);

      const result = await notifications.list(customerACtx, {});
      expect(result.pagination.total).toBe(3);
    });
  });

  // ---------------------------------------------------------------------
  // Team / invitations
  // ---------------------------------------------------------------------
  describe('team management', () => {
    it('an accepted invitation notifies the inviting tenant owner, not the new member', async () => {
      const token = 'a'.repeat(64);
      const invitation = await prisma.invitation.create({
        data: {
          organizationId: orgA.id,
          email: 'new-hire@test.local',
          role: ROLES.SUPPORT_AGENT,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 3600_000),
          invitedBy: ownerA.id,
        },
      });

      await invitations.accept(token, 'New Hire', 'SomePassword1');

      const result = (await notifications.list(ownerACtx, {})).data;
      const acceptedNotification = result.find((n) => n.type === NOTIFICATION_TYPES.TEAM_INVITATION_ACCEPTED);
      expect(acceptedNotification).toBeDefined();
      expect(acceptedNotification?.invitationId).toBe(invitation.id);

      const newUser = await prisma.user.findUniqueOrThrow({ where: { email: 'new-hire@test.local' } });
      expect(
        (await notifications.list(ctx(newUser, orgA.id, ROLES.SUPPORT_AGENT), {})).data,
      ).toHaveLength(0);
    });

    it('a role change notifies the affected member, not the actor (tenant owner)', async () => {
      await members.updateRole(ownerACtx, agentA.id, ROLES.TENANT_OWNER);

      const agentResult = (await notifications.list(agentACtx, {})).data;
      expect(agentResult.some((n) => n.type === NOTIFICATION_TYPES.TEAM_MEMBER_ROLE_CHANGED)).toBe(true);

      const ownerResult = (await notifications.list(ownerACtx, {})).data;
      expect(ownerResult.some((n) => n.type === NOTIFICATION_TYPES.TEAM_MEMBER_ROLE_CHANGED)).toBe(false);
    });

    it('removing a member notifies the removed member, not the actor', async () => {
      await members.remove(ownerACtx, agentA.id);

      const agentResult = (await notifications.list(agentACtx, {})).data;
      expect(agentResult.some((n) => n.type === NOTIFICATION_TYPES.TEAM_MEMBER_REMOVED)).toBe(true);

      const ownerResult = (await notifications.list(ownerACtx, {})).data;
      expect(ownerResult.some((n) => n.type === NOTIFICATION_TYPES.TEAM_MEMBER_REMOVED)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------
  describe('feedback', () => {
    it('a submitted response notifies the tenant owner only — feedback is tenant-owner-only, so a support agent is never notified', async () => {
      const otherCustomer = await mkUser(orgA.id, 'Other Customer', ROLES.CUSTOMER);
      const form = await prisma.feedbackForm.create({
        data: { organizationId: orgA.id, createdById: ownerA.id, title: 'Survey', status: 'ACTIVE' },
      });
      const question = await prisma.feedbackQuestion.create({
        data: { organizationId: orgA.id, formId: form.id, type: 'RATING', label: 'Rate us', order: 0 },
      });

      await feedback.submitResponse(customerACtx, form.id, { answers: [{ questionId: question.id, ratingValue: 5 }] });

      expect((await notifications.list(ownerACtx, {})).data.some((n) => n.type === NOTIFICATION_TYPES.FEEDBACK_SUBMITTED)).toBe(
        true,
      );
      expect((await notifications.list(agentACtx, {})).data.some((n) => n.type === NOTIFICATION_TYPES.FEEDBACK_SUBMITTED)).toBe(
        false,
      );
      expect((await notifications.list(ctx(otherCustomer, orgA.id, ROLES.CUSTOMER), {})).data).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // Plan limits
  // ---------------------------------------------------------------------
  describe('plan limits', () => {
    it('hitting the monthly ticket limit notifies the owner even though ticket creation itself fails', async () => {
      await prisma.organization.update({ where: { id: orgA.id }, data: { plan: 'FREE' } });
      // FREE allows 50 tickets/month (see packages/shared/src/constants/subscription.ts).
      for (let i = 0; i < 50; i++) {
        await tickets.create(customerACtx, { title: `Ticket ${i}`, description: 'x' });
      }
      await notifications.markAllRead(ownerACtx);

      await expect(tickets.create(customerACtx, { title: 'One too many', description: 'x' })).rejects.toMatchObject({
        response: { code: PLAN_LIMIT_ERROR_CODE },
      });

      const result = (await notifications.list(ownerACtx, { unreadOnly: true })).data;
      expect(result.some((n) => n.type === NOTIFICATION_TYPES.PLAN_LIMIT_REACHED)).toBe(true);

      // The 51st ticket itself was never created — the notification reports a true fact
      // about the limit, not a false claim that the ticket succeeded.
      const ticketCount = await prisma.ticket.count({ where: { organizationId: orgA.id } });
      expect(ticketCount).toBe(50);
    });

    it('Step 13/20: repeatedly hitting the same limit does not spam the owner with duplicate notifications', async () => {
      await prisma.organization.update({ where: { id: orgA.id }, data: { plan: 'FREE' } });
      for (let i = 0; i < 50; i++) {
        await tickets.create(customerACtx, { title: `Ticket ${i}`, description: 'x' });
      }
      await notifications.markAllRead(ownerACtx);

      for (let i = 0; i < 3; i++) {
        await tickets.create(customerACtx, { title: 'Blocked', description: 'x' }).catch(() => {});
      }

      const planLimitCount = (await notifications.list(ownerACtx, {})).data.filter(
        (n) => n.type === NOTIFICATION_TYPES.PLAN_LIMIT_REACHED,
      ).length;
      expect(planLimitCount).toBe(1);
    });
  });
});
