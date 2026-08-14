import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { NOTIFICATION_TYPES, ROLES, RpcAuthContext } from '@app/shared';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Integration tests against a real Postgres database (see ../../.env.test), mirroring the
 * pattern used across every other Phase's service spec. Covers Phase 8's own acceptance
 * criteria directly: tenant isolation (Step 18), pagination (Step 21), and read-state
 * (Step 22). Real business-event -> notification wiring (Step 19) and duplicate-prevention
 * (Step 20) are covered separately in notifications-events.service.spec.ts, which drives
 * the actual TicketsService/InvitationsService/MembersService/FeedbackService/
 * SubscriptionsService workflows rather than inserting Notification rows directly.
 */
describe('NotificationsService (integration — tenant + recipient isolation)', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let userAId: string; // User A, Org A
  let userA2Id: string; // User A2, Org A (second recipient in the same org)
  let userBId: string; // User B, Org B
  let ctxA: RpcAuthContext;
  let ctxA2: RpcAuthContext;
  let ctxB: RpcAuthContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' })],
      providers: [NotificationsService, PrismaService],
    }).compile();

    service = moduleRef.get(NotificationsService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({});
    await prisma.$disconnect();
  });

  const passwordHash$ = argon2.hash('SomePassword1');

  async function mkOrg(name: string) {
    return prisma.organization.create({ data: { name } });
  }

  async function mkUser(organizationId: string, name: string, role: string = ROLES.TENANT_OWNER) {
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

  function ctx(u: { id: string; email: string }, organizationId: string, role: string = ROLES.TENANT_OWNER): RpcAuthContext {
    return { userId: u.id, email: u.email, organizationId, role: role as never };
  }

  beforeEach(async () => {
    await prisma.organization.deleteMany({});

    orgA = await mkOrg('Org A');
    orgB = await mkOrg('Org B');

    // userA2 is SUPPORT_AGENT (not the default TENANT_OWNER) so orgA has exactly one tenant
    // owner (userA) unless a test explicitly adds more — needed for the plan-limit dedupe
    // tests below to have a predictable owner count.
    const [userA, userA2, userB] = await Promise.all([
      mkUser(orgA.id, 'User A'),
      mkUser(orgA.id, 'User A2', ROLES.SUPPORT_AGENT),
      mkUser(orgB.id, 'User B'),
    ]);
    userAId = userA.id;
    userA2Id = userA2.id;
    userBId = userB.id;
    ctxA = ctx(userA, orgA.id);
    ctxA2 = ctx(userA2, orgA.id);
    ctxB = ctx(userB, orgB.id);
  });

  async function notify(recipientId: string, organizationId: string, title = 'Hello') {
    await service.notify(prisma, {
      organizationId,
      recipientIds: [recipientId],
      type: NOTIFICATION_TYPES.TICKET_CREATED,
      title,
      message: 'A test notification.',
    });
  }

  // ---------------------------------------------------------------------
  // Tenant + recipient isolation (Step 18)
  // ---------------------------------------------------------------------
  describe('tenant + recipient isolation', () => {
    it('a user only ever sees their own notifications, never another user in the same org', async () => {
      await notify(userAId, orgA.id, 'For User A');
      await notify(userA2Id, orgA.id, 'For User A2');

      const resultA = await service.list(ctxA, {});
      expect(resultA.data).toHaveLength(1);
      expect(resultA.data[0].title).toBe('For User A');

      const resultA2 = await service.list(ctxA2, {});
      expect(resultA2.data).toHaveLength(1);
      expect(resultA2.data[0].title).toBe('For User A2');
    });

    it('a user never sees another organization’s notifications, even with the same-shaped query', async () => {
      await notify(userAId, orgA.id);
      await notify(userBId, orgB.id);

      const resultA = await service.list(ctxA, {});
      expect(resultA.data).toHaveLength(1);

      const resultB = await service.list(ctxB, {});
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].id).not.toBe(resultA.data[0].id);
    });

    it('GET-style "organizationId spoofing": the caller’s own authContext.organizationId is always used, no matter what the caller is a member of', async () => {
      await notify(userAId, orgA.id);
      // ctxB has a completely different organizationId; even though it's a syntactically
      // valid org, nothing in `list` ever consults anything but ctxB.organizationId, so it
      // is structurally impossible for this call to return Org A's notification.
      const result = await service.list(ctxB, {});
      expect(result.data).toHaveLength(0);
    });

    it('markRead on another user’s notification fails as not-found, not silently no-op-succeeds', async () => {
      const target = await prisma.notification.create({
        data: {
          organizationId: orgA.id,
          recipientId: userA2Id,
          type: NOTIFICATION_TYPES.TICKET_CREATED,
          title: 'For User A2',
          message: 'x',
        },
      });

      await expect(service.markRead(ctxA, target.id)).rejects.toThrow(NotFoundException);

      const stillUnread = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
      expect(stillUnread.read).toBe(false);
    });

    it('markRead on another organization’s notification fails as not-found', async () => {
      const target = await prisma.notification.create({
        data: {
          organizationId: orgB.id,
          recipientId: userBId,
          type: NOTIFICATION_TYPES.TICKET_CREATED,
          title: 'For Org B',
          message: 'x',
        },
      });

      await expect(service.markRead(ctxA, target.id)).rejects.toThrow(NotFoundException);
    });

    it('markAllRead only ever touches the caller’s own notifications', async () => {
      await notify(userAId, orgA.id);
      await notify(userAId, orgA.id);
      await notify(userA2Id, orgA.id);
      await notify(userBId, orgB.id);

      const result = await service.markAllRead(ctxA);
      expect(result.count).toBe(2);

      expect((await service.getUnreadCount(ctxA)).count).toBe(0);
      expect((await service.getUnreadCount(ctxA2)).count).toBe(1);
      expect((await service.getUnreadCount(ctxB)).count).toBe(1);
    });

    it('remove on another user’s notification fails as not-found and does not delete it', async () => {
      const target = await prisma.notification.create({
        data: {
          organizationId: orgA.id,
          recipientId: userA2Id,
          type: NOTIFICATION_TYPES.TICKET_CREATED,
          title: 'For User A2',
          message: 'x',
        },
      });

      await expect(service.remove(ctxA, target.id)).rejects.toThrow(NotFoundException);
      await expect(prisma.notification.findUniqueOrThrow({ where: { id: target.id } })).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------
  // Unread count (Step 9, Step 22)
  // ---------------------------------------------------------------------
  describe('unread count', () => {
    it('is computed from the database and is tenant- and recipient-scoped', async () => {
      await notify(userAId, orgA.id);
      await notify(userAId, orgA.id);
      await notify(userA2Id, orgA.id);
      await notify(userBId, orgB.id);

      expect((await service.getUnreadCount(ctxA)).count).toBe(2);
      expect((await service.getUnreadCount(ctxA2)).count).toBe(1);
      expect((await service.getUnreadCount(ctxB)).count).toBe(1);
    });

    it('decreases by exactly one when a single notification is marked read, and is unaffected for other users', async () => {
      await notify(userAId, orgA.id);
      await notify(userAId, orgA.id);
      await notify(userA2Id, orgA.id);

      const [first] = (await service.list(ctxA, {})).data;
      await service.markRead(ctxA, first.id);

      expect((await service.getUnreadCount(ctxA)).count).toBe(1);
      expect((await service.getUnreadCount(ctxA2)).count).toBe(1);
    });

    it('marking an already-read notification read again does not change the count (idempotent)', async () => {
      await notify(userAId, orgA.id);
      const [first] = (await service.list(ctxA, {})).data;

      await service.markRead(ctxA, first.id);
      await service.markRead(ctxA, first.id);

      expect((await service.getUnreadCount(ctxA)).count).toBe(0);
    });

    it('markAllRead brings the count to exactly zero', async () => {
      await notify(userAId, orgA.id);
      await notify(userAId, orgA.id);
      await notify(userAId, orgA.id);

      await service.markAllRead(ctxA);
      expect((await service.getUnreadCount(ctxA)).count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Pagination + unread filtering (Step 8, Step 21)
  // ---------------------------------------------------------------------
  describe('pagination and unread filtering', () => {
    it('paginates correctly across two pages with an exact total count', async () => {
      for (let i = 0; i < 25; i++) {
        await notify(userAId, orgA.id, `Notification ${i}`);
      }

      const page1 = await service.list(ctxA, { page: 1, limit: 20 });
      expect(page1.data).toHaveLength(20);
      expect(page1.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });

      const page2 = await service.list(ctxA, { page: 2, limit: 20 });
      expect(page2.data).toHaveLength(5);
      expect(page2.pagination.total).toBe(25);

      const idsPage1 = new Set(page1.data.map((n) => n.id));
      const idsPage2 = new Set(page2.data.map((n) => n.id));
      for (const id of idsPage2) expect(idsPage1.has(id)).toBe(false);
    });

    it('orders newest first', async () => {
      const first = await prisma.notification.create({
        data: {
          organizationId: orgA.id,
          recipientId: userAId,
          type: NOTIFICATION_TYPES.TICKET_CREATED,
          title: 'Older',
          message: 'x',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
      const second = await prisma.notification.create({
        data: {
          organizationId: orgA.id,
          recipientId: userAId,
          type: NOTIFICATION_TYPES.TICKET_CREATED,
          title: 'Newer',
          message: 'x',
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
      });

      const result = await service.list(ctxA, {});
      expect(result.data.map((n) => n.id)).toEqual([second.id, first.id]);
    });

    it('unreadOnly filters out read notifications, scoped by database WHERE, not JS filtering', async () => {
      await notify(userAId, orgA.id, 'Unread one');
      await notify(userAId, orgA.id, 'Will be read');
      const [, toRead] = (await service.list(ctxA, {})).data.reverse();
      await service.markRead(ctxA, toRead.id);

      const unreadOnly = await service.list(ctxA, { unreadOnly: true });
      expect(unreadOnly.data).toHaveLength(1);
      expect(unreadOnly.data[0].title).toBe('Unread one');
      expect(unreadOnly.pagination.total).toBe(1);
    });

    it('never loads another tenant’s or another user’s rows into a paginated page', async () => {
      for (let i = 0; i < 5; i++) await notify(userAId, orgA.id);
      for (let i = 0; i < 5; i++) await notify(userA2Id, orgA.id);
      for (let i = 0; i < 5; i++) await notify(userBId, orgB.id);

      const result = await service.list(ctxA, { limit: 100 });
      expect(result.pagination.total).toBe(5);
      expect(result.data).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------
  // Read state / DTO shape
  // ---------------------------------------------------------------------
  describe('notification shape and read state', () => {
    it('markRead sets read=true and stamps readAt', async () => {
      await notify(userAId, orgA.id);
      const [created] = (await service.list(ctxA, {})).data;
      expect(created.read).toBe(false);
      expect(created.readAt).toBeNull();

      const updated = await service.markRead(ctxA, created.id);
      expect(updated.read).toBe(true);
      expect(updated.readAt).not.toBeNull();
    });

    it('carries the related ticketId through untouched, and leaves the other related-entity fields null', async () => {
      await service.notify(prisma, {
        organizationId: orgA.id,
        recipientIds: [userAId],
        type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
        title: 'Ticket assigned',
        message: 'x',
        ticketId: 'some-ticket-id',
      });

      const [created] = (await service.list(ctxA, {})).data;
      expect(created.ticketId).toBe('some-ticket-id');
      expect(created.invitationId).toBeNull();
      expect(created.feedbackFormId).toBeNull();
    });

    it('remains readable (does not crash or 500) when its related ticketId no longer resolves to a real ticket', async () => {
      await service.notify(prisma, {
        organizationId: orgA.id,
        recipientIds: [userAId],
        type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
        title: 'Ticket assigned',
        message: 'x',
        ticketId: 'deleted-ticket-id',
      });

      const result = await service.list(ctxA, {});
      expect(result.data[0].ticketId).toBe('deleted-ticket-id');
    });
  });

  // ---------------------------------------------------------------------
  // Plan-limit dedupe (Step 13/20)
  // ---------------------------------------------------------------------
  describe('notifyPlanLimitReached', () => {
    it('notifies every active tenant owner but not support agents or customers', async () => {
      const owner2 = await mkUser(orgA.id, 'Owner 2', ROLES.TENANT_OWNER);
      await mkUser(orgA.id, 'Agent', ROLES.SUPPORT_AGENT);
      await mkUser(orgA.id, 'Customer', ROLES.CUSTOMER);

      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');

      expect((await service.getUnreadCount(ctxA)).count).toBe(1);
      expect((await service.getUnreadCount(ctx(owner2, orgA.id))).count).toBe(1);
    });

    it('does not notify an inactive (removed) tenant owner', async () => {
      await prisma.user.update({ where: { id: userAId }, data: { isActive: false } });

      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');

      const count = await prisma.notification.count({ where: { organizationId: orgA.id } });
      expect(count).toBe(0);
    });

    it('does not spam: a second call while the first notification is still unread creates no new row', async () => {
      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');
      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');
      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');

      const count = await prisma.notification.count({ where: { organizationId: orgA.id } });
      expect(count).toBe(1);
    });

    it('notifies again once the owner has read the previous plan-limit notification', async () => {
      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');
      await service.markAllRead(ctxA);
      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');

      const count = await prisma.notification.count({ where: { organizationId: orgA.id } });
      expect(count).toBe(2);
    });

    it('never notifies another organization’s owners', async () => {
      await service.notifyPlanLimitReached(orgA.id, 'Limit reached', 'You hit a limit.');
      expect((await service.getUnreadCount(ctxB)).count).toBe(0);
    });
  });
});
