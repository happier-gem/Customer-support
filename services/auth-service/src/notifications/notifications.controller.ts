import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NOTIFICATION_PATTERNS, RpcAuthContext } from '@app/shared';
import { NotificationsService, NotificationListQuery } from './notifications.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @MessagePattern(NOTIFICATION_PATTERNS.LIST)
  list(@Payload() data: { authContext: RpcAuthContext } & NotificationListQuery) {
    const { authContext, ...query } = data;
    return this.notifications.list(authContext, query);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.UNREAD_COUNT)
  unreadCount(@Payload() data: { authContext: RpcAuthContext }) {
    return this.notifications.getUnreadCount(data.authContext);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.MARK_READ)
  markRead(@Payload() data: { authContext: RpcAuthContext; notificationId: string }) {
    return this.notifications.markRead(data.authContext, data.notificationId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.MARK_ALL_READ)
  markAllRead(@Payload() data: { authContext: RpcAuthContext }) {
    return this.notifications.markAllRead(data.authContext);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.DELETE)
  remove(@Payload() data: { authContext: RpcAuthContext; notificationId: string }) {
    return this.notifications.remove(data.authContext, data.notificationId);
  }
}
