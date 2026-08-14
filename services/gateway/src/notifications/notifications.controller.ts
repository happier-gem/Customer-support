import { Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  NOTIFICATION_PATTERNS,
  NotificationDto,
  NotificationQueryDto,
  PaginatedResult,
  UnreadCountDto,
} from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Every authenticated role (customer, support agent, tenant owner) has notifications of
 * its own, so this is JwtAuthGuard-only — no @Roles() restriction. `user` (from the
 * verified access token) is the only tenant/recipient scope ever sent to auth-service;
 * there is nowhere on any of these routes for a client to name a different organization
 * or a different recipient.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get()
  async list(@Query() query: NotificationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PaginatedResult<NotificationDto>>(NOTIFICATION_PATTERNS.LIST, {
      authContext: user,
      ...query,
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<UnreadCountDto>(NOTIFICATION_PATTERNS.UNREAD_COUNT, { authContext: user });
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<{ count: number }>(NOTIFICATION_PATTERNS.MARK_ALL_READ, { authContext: user });
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<NotificationDto>(NOTIFICATION_PATTERNS.MARK_READ, {
      authContext: user,
      notificationId: id,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<void>(NOTIFICATION_PATTERNS.DELETE, { authContext: user, notificationId: id });
  }
}
