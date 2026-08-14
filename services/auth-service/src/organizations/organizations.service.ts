import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { OrganizationDto, ROLES, RpcAuthContext } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';

function toDto(org: Organization): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The tenant-isolation boundary lives here, not in the gateway: every
   * lookup is scoped by `authContext.organizationId` (taken from the
   * caller's verified JWT), never by a client-supplied id, except for
   * PLATFORM_ADMIN which is explicitly allowed to cross tenants.
   */
  private assertCanAccess(authContext: RpcAuthContext, requestedOrganizationId: string): void {
    if (authContext.role === ROLES.PLATFORM_ADMIN) return;
    if (authContext.organizationId !== requestedOrganizationId) {
      throw new ForbiddenException('You do not have access to this organization.');
    }
  }

  async getById(authContext: RpcAuthContext, requestedOrganizationId: string): Promise<OrganizationDto> {
    this.assertCanAccess(authContext, requestedOrganizationId);

    const org = await this.prisma.organization.findUnique({ where: { id: requestedOrganizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return toDto(org);
  }

  async update(authContext: RpcAuthContext, requestedOrganizationId: string, name: string): Promise<OrganizationDto> {
    this.assertCanAccess(authContext, requestedOrganizationId);

    if (authContext.role !== ROLES.PLATFORM_ADMIN && authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can update the organization.');
    }

    const existing = await this.prisma.organization.findUnique({ where: { id: requestedOrganizationId } });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.organization.update({
      where: { id: requestedOrganizationId },
      data: { name: name.trim() },
    });
    return toDto(updated);
  }

  /** Platform-wide, intentionally not scoped to any single tenant. Caller-role check is defense-in-depth for the gateway's @Roles guard. */
  async list(authContext: RpcAuthContext): Promise<OrganizationDto[]> {
    if (authContext.role !== ROLES.PLATFORM_ADMIN) {
      throw new ForbiddenException('Only a platform admin can list all organizations.');
    }

    const orgs = await this.prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
    return orgs.map(toDto);
  }
}
