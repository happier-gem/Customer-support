import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreatedInvitationDto, INVITATION_PATTERNS, InvitationDto, InviteMemberDto, ROLES } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Only a Tenant Owner may invite into their own organization —
 * `user.organizationId` (JWT-derived) is the only tenant scope forwarded to
 * auth-service, so this can never be used to create an invitation for
 * another organization.
 */
@Controller('organizations/me/invitations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.TENANT_OWNER)
export class TeamInvitationsController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<InvitationDto[]>(INVITATION_PATTERNS.LIST, { authContext: user });
  }

  @Post()
  async create(@Body() dto: InviteMemberDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<CreatedInvitationDto>(INVITATION_PATTERNS.CREATE, {
      authContext: user,
      email: dto.email,
      role: dto.role,
    });
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<InvitationDto>(INVITATION_PATTERNS.REVOKE, {
      authContext: user,
      invitationId: id,
    });
  }

  @Post(':id/resend')
  async resend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<CreatedInvitationDto>(INVITATION_PATTERNS.RESEND, {
      authContext: user,
      invitationId: id,
    });
  }
}
