import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ORG_PATTERNS, OrganizationDto, ROLES, UpdateOrganizationDto } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Every route here is behind JwtAuthGuard, so `user` is always derived from a
 * verified access token — never from the URL, query, or request body. The
 * `:id` route param is only "which organization is being requested"; the
 * *authorization* decision (does this caller get to see/edit it) is made
 * against `user.organizationId`/`user.role`, both server-trusted, and is
 * enforced again inside auth-service against the database — not just here.
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get()
  @Roles(ROLES.PLATFORM_ADMIN)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<OrganizationDto[]>(ORG_PATTERNS.LIST, { authContext: user });
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<OrganizationDto>(ORG_PATTERNS.GET_BY_ID, {
      authContext: user,
      organizationId: id,
    });
  }

  @Patch(':id')
  @Roles(ROLES.TENANT_OWNER, ROLES.PLATFORM_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<OrganizationDto>(ORG_PATTERNS.UPDATE, {
      authContext: user,
      organizationId: id,
      name: dto.name,
    });
  }
}
