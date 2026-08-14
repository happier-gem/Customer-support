import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { MEMBER_PATTERNS, MemberDto, ROLES, UpdateMemberRoleDto } from '@app/shared';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Team-member management for the caller's own organization. `user.organizationId`
 * (from the verified JWT) is the only tenant scope ever sent to auth-service —
 * `:userId` only selects *which* member within that scope, and auth-service
 * re-verifies the target belongs to the same org before touching anything.
 */
@Controller('organizations/me/members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.TENANT_OWNER)
export class MembersController {
  constructor(private readonly authGateway: AuthGatewayService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<MemberDto[]>(MEMBER_PATTERNS.LIST, { authContext: user });
  }

  @Patch(':userId/role')
  async updateRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authGateway.send<MemberDto>(MEMBER_PATTERNS.UPDATE_ROLE, {
      authContext: user,
      userId,
      role: dto.role,
    });
  }

  @Delete(':userId')
  async remove(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authGateway.send<{ message: string }>(MEMBER_PATTERNS.REMOVE, { authContext: user, userId });
  }
}
