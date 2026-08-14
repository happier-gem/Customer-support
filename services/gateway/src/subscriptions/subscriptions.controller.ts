import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ChangePlanDto, ROLES, SUBSCRIPTION_PATTERNS, SubscriptionDto, SubscriptionPlanDto } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Phase 6: subscription/plan management. Every route is Tenant-Owner-only —
 * per Part 24, customers and support agents never manage subscriptions, they
 * just receive PLAN_LIMIT_REACHED errors from the resource endpoints
 * (tickets/feedback forms/invitations) when a limit blocks them. Tenant
 * scope always comes from the verified JWT (`user.organizationId`), never
 * from the request.
 */
@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get()
  @Roles(ROLES.TENANT_OWNER)
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<SubscriptionDto>(SUBSCRIPTION_PATTERNS.GET, { authContext: user });
  }

  @Get('plans')
  @Roles(ROLES.TENANT_OWNER)
  async listPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<SubscriptionPlanDto[]>(SUBSCRIPTION_PATTERNS.LIST_PLANS, { authContext: user });
  }

  @Patch('change-plan')
  @Roles(ROLES.TENANT_OWNER)
  async changePlan(@Body() dto: ChangePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<SubscriptionDto>(SUBSCRIPTION_PATTERNS.CHANGE_PLAN, { authContext: user, plan: dto.plan });
  }
}
