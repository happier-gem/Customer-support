import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CUSTOMER_JOIN_PATTERNS, JoinLinkDto, ROLES } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Tenant Owner management of their organization's standing customer-join
 * link/QR/code (see CustomerJoinService). Every route scopes to
 * `user.organizationId` (JWT-derived) only — there is no way to manage
 * another organization's join link through this controller.
 */
@Controller('organizations/me/customer-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.TENANT_OWNER)
export class CustomerAccessController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get()
  async getOrCreate(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<JoinLinkDto>(CUSTOMER_JOIN_PATTERNS.GET_OR_CREATE, { authContext: user });
  }

  @Post('regenerate')
  async regenerate(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<JoinLinkDto>(CUSTOMER_JOIN_PATTERNS.REGENERATE, { authContext: user });
  }

  @Post('revoke')
  async revoke(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<JoinLinkDto>(CUSTOMER_JOIN_PATTERNS.REVOKE, { authContext: user });
  }
}
