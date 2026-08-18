import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerJoinLink } from '@prisma/client';
import { JoinLinkDto, JoinPreviewDto, ROLES, RpcAuthContext } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { generateJoinCode, generateSecureToken } from '../auth/utils/token.util';

const INVALID_JOIN_LINK_ERROR = 'This join link or code is invalid or has been revoked.';

/**
 * Phase 10: a tenant's standing, shareable "join my organization" link for
 * customers. Distinct from InvitationsService (single-use, email-targeted,
 * hash-only-at-rest staff invites) — this is a durable, public identifier
 * meant to be posted/printed/scanned by anyone the tenant chooses to share
 * it with, so it is stored in plaintext (see the schema comment) and never
 * expires on its own, only via explicit regenerate/revoke.
 */
@Injectable()
export class CustomerJoinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private assertTenantOwner(authContext: RpcAuthContext): void {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can manage the customer join link.');
    }
  }

  private buildJoinUrl(token: string): string {
    const base = this.config.get<string>('CUSTOMER_APP_URL') ?? 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}/join/customer/${token}`;
  }

  private toDto(link: CustomerJoinLink): JoinLinkDto {
    return {
      code: link.code,
      joinUrl: this.buildJoinUrl(link.token),
      isActive: link.isActive,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    };
  }

  /** Auto-provisions the org's link on first visit to the Customer Access settings page. */
  async getOrCreate(authContext: RpcAuthContext): Promise<JoinLinkDto> {
    this.assertTenantOwner(authContext);

    const existing = await this.prisma.customerJoinLink.findUnique({
      where: { organizationId: authContext.organizationId },
    });
    if (existing) {
      return this.toDto(existing);
    }

    const created = await this.prisma.customerJoinLink.create({
      data: {
        organizationId: authContext.organizationId,
        token: generateSecureToken(),
        code: generateJoinCode(),
      },
    });
    return this.toDto(created);
  }

  /** Rotates the token/code in place — the previous link/QR/code stops resolving immediately. Reactivates if previously revoked. */
  async regenerate(authContext: RpcAuthContext): Promise<JoinLinkDto> {
    this.assertTenantOwner(authContext);

    const updated = await this.prisma.customerJoinLink.upsert({
      where: { organizationId: authContext.organizationId },
      create: {
        organizationId: authContext.organizationId,
        token: generateSecureToken(),
        code: generateJoinCode(),
      },
      update: {
        token: generateSecureToken(),
        code: generateJoinCode(),
        isActive: true,
      },
    });
    return this.toDto(updated);
  }

  async revoke(authContext: RpcAuthContext): Promise<JoinLinkDto> {
    this.assertTenantOwner(authContext);

    const existing = await this.prisma.customerJoinLink.findUnique({
      where: { organizationId: authContext.organizationId },
    });
    if (!existing) {
      throw new NotFoundException('No customer join link exists yet for this organization.');
    }

    const updated = await this.prisma.customerJoinLink.update({
      where: { organizationId: authContext.organizationId },
      data: { isActive: false },
    });
    return this.toDto(updated);
  }

  /** Public: resolves the organization a join link/QR points at. Generic error on any invalid/revoked token — never confirms whether a given token ever existed. */
  async resolveByToken(token: string): Promise<JoinPreviewDto> {
    const link = await this.prisma.customerJoinLink.findFirst({
      where: { token, isActive: true },
      include: { organization: true },
    });
    if (!link) {
      throw new NotFoundException(INVALID_JOIN_LINK_ERROR);
    }
    return { organizationName: link.organization.name, joinToken: link.token };
  }

  /** Public: resolves a manually-typed short code the same way resolveByToken resolves a link/QR. */
  async resolveByCode(code: string): Promise<JoinPreviewDto> {
    const normalized = code.trim().toUpperCase();
    const link = await this.prisma.customerJoinLink.findFirst({
      where: { code: normalized, isActive: true },
      include: { organization: true },
    });
    if (!link) {
      throw new NotFoundException(INVALID_JOIN_LINK_ERROR);
    }
    return { organizationName: link.organization.name, joinToken: link.token };
  }

  /**
   * Internal, in-process use only (AuthService.registerCustomer) — same
   * resolution as resolveByToken but returns the full record so the caller
   * can read `organizationId` without a second lookup.
   */
  async resolveOrganizationIdByToken(token: string): Promise<string> {
    const link = await this.prisma.customerJoinLink.findFirst({ where: { token, isActive: true } });
    if (!link) {
      throw new NotFoundException(INVALID_JOIN_LINK_ERROR);
    }
    return link.organizationId;
  }
}
