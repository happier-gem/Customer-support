import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import {
  ASSIGNABLE_TEAM_ROLES,
  AssignableTeamRole,
  MemberDto,
  NOTIFICATION_TYPES,
  ROLES,
  RpcAuthContext,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

function toDto(user: User): MemberDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Team-member management for a Tenant Owner's own organization. Every
 * operation is scoped by `authContext.organizationId` (from the caller's
 * verified JWT) — a target `userId` that resolves to a user in a different
 * organization is treated as not found, never as "forbidden", so a caller
 * can't use this to probe which user ids exist in other tenants.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertIsTenantOwner(authContext: RpcAuthContext): void {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can manage team members.');
    }
  }

  private async getMemberInOwnOrg(authContext: RpcAuthContext, userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.organizationId !== authContext.organizationId) {
      throw new NotFoundException('Team member not found');
    }
    return user;
  }

  async list(authContext: RpcAuthContext): Promise<MemberDto[]> {
    this.assertIsTenantOwner(authContext);

    const users = await this.prisma.user.findMany({
      where: { organizationId: authContext.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toDto);
  }

  async updateRole(authContext: RpcAuthContext, targetUserId: string, role: AssignableTeamRole): Promise<MemberDto> {
    this.assertIsTenantOwner(authContext);

    if (!ASSIGNABLE_TEAM_ROLES.includes(role)) {
      throw new BadRequestException('Invalid role.');
    }

    const target = await this.getMemberInOwnOrg(authContext, targetUserId);

    if (target.role === ROLES.TENANT_OWNER && role !== ROLES.TENANT_OWNER) {
      await this.assertNotLastActiveOwner(authContext.organizationId, target.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id: target.id }, data: { role } });

      // Never self-notify: a tenant owner changing their own role (if that's ever
      // reachable) already knows.
      if (target.id !== authContext.userId) {
        await this.notifications.notify(tx, {
          organizationId: authContext.organizationId,
          recipientIds: [target.id],
          type: NOTIFICATION_TYPES.TEAM_MEMBER_ROLE_CHANGED,
          title: 'Your role has changed',
          message: `Your role was changed to ${role.replace(/_/g, ' ')}.`,
        });
      }

      return result;
    });

    return toDto(updated);
  }

  async remove(authContext: RpcAuthContext, targetUserId: string): Promise<{ message: string }> {
    this.assertIsTenantOwner(authContext);

    const target = await this.getMemberInOwnOrg(authContext, targetUserId);

    if (!target.isActive) {
      return { message: 'Team member already removed.' };
    }

    if (target.role === ROLES.TENANT_OWNER) {
      await this.assertNotLastActiveOwner(authContext.organizationId, target.id);
    }

    await this.prisma.$transaction(async (tx) => {
      // Deactivate rather than delete, to preserve historical data, and
      // revoke any active session immediately.
      await tx.user.update({
        where: { id: target.id },
        data: { isActive: false, refreshTokenHash: null },
      });

      if (target.id !== authContext.userId) {
        await this.notifications.notify(tx, {
          organizationId: authContext.organizationId,
          recipientIds: [target.id],
          type: NOTIFICATION_TYPES.TEAM_MEMBER_REMOVED,
          title: 'Removed from organization',
          message: 'You have been removed from the organization.',
        });
      }
    });

    return { message: 'Team member removed.' };
  }

  /** Blocks an operation that would leave the organization with zero active tenant owners. */
  private async assertNotLastActiveOwner(organizationId: string, excludingUserId: string): Promise<void> {
    const otherActiveOwners = await this.prisma.user.count({
      where: {
        organizationId,
        role: ROLES.TENANT_OWNER,
        isActive: true,
        id: { not: excludingUserId },
      },
    });
    if (otherActiveOwners === 0) {
      throw new BadRequestException('An organization must always have at least one active tenant owner.');
    }
  }
}
