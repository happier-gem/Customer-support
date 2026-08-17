import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MembersModule } from './members/members.module';
import { InvitationsModule } from './invitations/invitations.module';
import { TicketsModule } from './tickets/tickets.module';
import { FeedbackModule } from './feedback/feedback.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default sized for real multi-page usage: a single dashboard load
    // already fires several parallel calls (notifications, tickets, members),
    // and normal browsing across a session adds up quickly — 300/min per IP
    // is still a meaningful abuse guard without throttling legitimate use.
    // OTP-specific routes override it with much tighter per-route limits via
    // @Throttle() (see AuthController.verifyEmail/resendOtp).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    OrganizationsModule,
    MembersModule,
    InvitationsModule,
    TicketsModule,
    FeedbackModule,
    SubscriptionsModule,
    AnalyticsModule,
    NotificationsModule,
    AdminModule,
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class GatewayModule {}
