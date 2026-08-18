import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ADMIN_PATTERNS,
  AdminOrganizationDto,
  AdminOrganizationQueryDto,
  AdminUserDto,
  AdminUserQueryDto,
  PaginatedResult,
  PlanType,
  PlatformStatsDto,
  ROLES,
  SubscriptionPlanDto,
  UpdatePlanLimitsDto,
} from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Phase 9: the dedicated Platform Admin surface — every route requires PLATFORM_ADMIN
 * explicitly (never "not a customer" / "not a tenant owner"). `user` (from the verified
 * JWT) is only ever used here to prove the caller *is* a platform admin; unlike every
 * tenant controller in this app, no route here scopes anything by `user.organizationId` —
 * the `:id` in the URL is the only organization scope, and auth-service re-verifies the
 * caller's role again before touching it (defense in depth).
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.PLATFORM_ADMIN)
export class AdminController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get('organizations')
  async listOrganizations(@Query() query: AdminOrganizationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PaginatedResult<AdminOrganizationDto>>(ADMIN_PATTERNS.LIST_ORGANIZATIONS, {
      authContext: user,
      ...query,
    });
  }

  @Get('organizations/:id')
  async getOrganization(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<AdminOrganizationDto>(ADMIN_PATTERNS.GET_ORGANIZATION, {
      authContext: user,
      organizationId: id,
    });
  }

  @Patch('organizations/:id/suspend')
  async suspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<AdminOrganizationDto>(ADMIN_PATTERNS.SET_ORGANIZATION_SUSPENDED, {
      authContext: user,
      organizationId: id,
      isSuspended: true,
    });
  }

  @Patch('organizations/:id/activate')
  async activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<AdminOrganizationDto>(ADMIN_PATTERNS.SET_ORGANIZATION_SUSPENDED, {
      authContext: user,
      organizationId: id,
      isSuspended: false,
    });
  }

  @Get('stats')
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PlatformStatsDto>(ADMIN_PATTERNS.PLATFORM_STATS, { authContext: user });
  }

  @Get('plans')
  async listPlans(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<SubscriptionPlanDto[]>(ADMIN_PATTERNS.LIST_PLANS, { authContext: user });
  }

  @Patch('plans/:plan')
  async updatePlanLimits(
    @Param('plan') plan: PlanType,
    @Body() dto: UpdatePlanLimitsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<SubscriptionPlanDto>(ADMIN_PATTERNS.UPDATE_PLAN_LIMITS, {
      authContext: user,
      plan,
      limits: {
        teamMembers: dto.teamMembers ?? null,
        monthlyTickets: dto.monthlyTickets ?? null,
        feedbackForms: dto.feedbackForms ?? null,
      },
    });
  }

  @Get('users')
  async listUsers(@Query() query: AdminUserQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<PaginatedResult<AdminUserDto>>(ADMIN_PATTERNS.LIST_USERS, {
      authContext: user,
      ...query,
    });
  }

  @Patch('users/:id/deactivate')
  async deactivateUser(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<AdminUserDto>(ADMIN_PATTERNS.SET_USER_ACTIVE, {
      authContext: user,
      userId: id,
      isActive: false,
    });
  }

  @Patch('users/:id/reactivate')
  async reactivateUser(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<AdminUserDto>(ADMIN_PATTERNS.SET_USER_ACTIVE, {
      authContext: user,
      userId: id,
      isActive: true,
    });
  }
}
