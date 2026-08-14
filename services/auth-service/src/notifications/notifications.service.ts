import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import {
  NOTIFICATION_DEFAULT_PAGE_SIZE,
  NOTIFICATION_MAX_PAGE_SIZE,
  NOTIFICATION_TYPES,
  NotificationDto,
  NotificationType,
  PaginatedResult,
  ROLES,
  RpcAuthContext,
  UnreadCountDto,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A plain PrismaService and a Prisma transaction client expose the same query methods
 * (mirrors SubscriptionsService's `Db` type) — callers that want notification creation to
 * be part of a larger state-changing transaction (Step 14) pass their `tx`; independent
 * writes (e.g. the plan-limit notification, which must survive the transaction that
 * triggered it rolling back) pass a bare PrismaService.
 */
type Db = Prisma.TransactionClient | PrismaService;

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface CreateNotificationInput {
  organizationId: string;
  recipientIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  ticketId?: string;
  invitationId?: string;
  feedbackFormId?: string;
}

function toDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    organizationId: notification.organizationId,
    type: notification.type as NotificationType,
    title: notification.title,
    message: notification.message,
    read: notification.read,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    ticketId: notification.ticketId,
    invitationId: notification.invitationId,
    feedbackFormId: notification.feedbackFormId,
    createdAt: notification.createdAt.toISOString(),
  };
}

/**
 * Owns all Phase 8 notification data. Every read/write on behalf of a caller is scoped by
 * `authContext.organizationId` *and* `authContext.recipientId === authContext.userId` — a
 * client can never see or mutate another user's or another tenant's notifications by
 * supplying an id in a route/query/body, because none of these methods accept an
 * organizationId or recipientId argument from outside the auth context. Cross-tenant or
 * cross-user lookups fail as "not found" rather than "forbidden", the same discipline as
 * TicketsService/FeedbackService, so a caller can't use this service to probe which
 * notification ids exist for someone else.
 *
 * Creation (the `notify*` methods) is the one place this service accepts an explicit
 * organizationId/recipientId list — always resolved server-side by the calling service
 * from its own authContext and/or a database lookup of who is authorized to know about the
 * event, never from client input.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(authContext: RpcAuthContext, query: NotificationListQuery): Promise<PaginatedResult<NotificationDto>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, NOTIFICATION_MAX_PAGE_SIZE) : NOTIFICATION_DEFAULT_PAGE_SIZE;

    const where: Prisma.NotificationWhereInput = {
      organizationId: authContext.organizationId,
      recipientId: authContext.userId,
      ...(query.unreadOnly ? { read: false } : {}),
    };

    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: notifications.map(toDto),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getUnreadCount(authContext: RpcAuthContext): Promise<UnreadCountDto> {
    const count = await this.prisma.notification.count({
      where: { organizationId: authContext.organizationId, recipientId: authContext.userId, read: false },
    });
    return { count };
  }

  /** Tenant- and recipient-scoped lookup shared by markRead/remove. */
  private async getOwnNotification(authContext: RpcAuthContext, notificationId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, organizationId: authContext.organizationId, recipientId: authContext.userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async markRead(authContext: RpcAuthContext, notificationId: string): Promise<NotificationDto> {
    const notification = await this.getOwnNotification(authContext, notificationId);

    if (notification.read) {
      return toDto(notification);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { read: true, readAt: new Date() },
    });
    return toDto(updated);
  }

  async markAllRead(authContext: RpcAuthContext): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId: authContext.organizationId, recipientId: authContext.userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { count: result.count };
  }

  async remove(authContext: RpcAuthContext, notificationId: string): Promise<void> {
    const notification = await this.getOwnNotification(authContext, notificationId);
    await this.prisma.notification.delete({ where: { id: notification.id } });
  }

  // ---------------------------------------------------------------------
  // Creation — called in-process by the services that own each triggering
  // event (TicketsService, InvitationsService, MembersService,
  // FeedbackService, SubscriptionsService). Never exposed over RPC: a
  // client can never ask to create a notification for anyone.
  // ---------------------------------------------------------------------

  /** Creates one notification row per recipient. No-op if `recipientIds` is empty. */
  async notify(db: Db, input: CreateNotificationInput): Promise<void> {
    if (input.recipientIds.length === 0) return;

    await db.notification.createMany({
      data: input.recipientIds.map((recipientId) => ({
        organizationId: input.organizationId,
        recipientId,
        type: input.type,
        title: input.title,
        message: input.message,
        ticketId: input.ticketId ?? null,
        invitationId: input.invitationId ?? null,
        feedbackFormId: input.feedbackFormId ?? null,
      })),
    });
  }

  /**
   * Step 13 (avoid duplicate notifications): a customer repeatedly retrying a blocked
   * action (e.g. creating a ticket past the monthly limit) would otherwise re-notify the
   * owner on every single attempt. Skip any active tenant owner who already has an unread
   * PLAN_LIMIT_REACHED notification — once they read it (or it's cleared), the next
   * genuine limit hit notifies them again. Always called with a bare PrismaService (never
   * a `tx`), so this is written independently of whatever transaction the limit check
   * itself is running in and survives that transaction's rollback (Step 14: the
   * notification reports a true fact — "the limit was hit" — regardless of whether the
   * blocked create ultimately committed).
   */
  async notifyPlanLimitReached(organizationId: string, title: string, message: string): Promise<void> {
    const owners = await this.prisma.user.findMany({
      where: { organizationId, role: ROLES.TENANT_OWNER, isActive: true },
      select: { id: true },
    });
    if (owners.length === 0) return;

    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        organizationId,
        type: NOTIFICATION_TYPES.PLAN_LIMIT_REACHED,
        read: false,
        recipientId: { in: owners.map((o) => o.id) },
      },
      select: { recipientId: true },
    });
    const notifiedIds = new Set(alreadyNotified.map((n) => n.recipientId));
    const recipientIds = owners.map((o) => o.id).filter((id) => !notifiedIds.has(id));

    await this.notify(this.prisma, {
      organizationId,
      recipientIds,
      type: NOTIFICATION_TYPES.PLAN_LIMIT_REACHED,
      title,
      message,
    });
  }
}
