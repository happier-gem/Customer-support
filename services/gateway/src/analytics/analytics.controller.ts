import { Controller, Get, UseGuards } from '@nestjs/common';
import { ANALYTICS_PATTERNS, AnalyticsOverviewDto, ROLES } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Phase 7: Tenant Owner analytics dashboard. Least-privilege per Step 14 — Support Agents
 * and Customers are not granted access here (the assignment scopes analytics to the
 * Tenant Owner's reports), and Platform Admin analytics is out of scope until its own
 * later phase. Tenant scope always comes from the verified JWT (`user.organizationId`),
 * never from a request parameter — there is nowhere on this route for a client to name a
 * different organization.
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.TENANT_OWNER)
export class AnalyticsController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<AnalyticsOverviewDto>(ANALYTICS_PATTERNS.OVERVIEW, { authContext: user });
  }
}
