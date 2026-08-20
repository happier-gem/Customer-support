import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invitation, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ASSIGNABLE_TEAM_ROLES,
  AssignableTeamRole,
  CreatedInvitationDto,
  InvitationDto,
  InvitationPreviewDto,
  NOTIFICATION_TYPES,
  ROLES,
  RpcAuthContext,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { generateSecureToken, hashToken } from '../auth/utils/token.util';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

const INVALID_INVITATION_ERROR = 'This invitation link is invalid or has expired.';

function toDto(invitation: Invitation): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private get expiresInHours(): number {
    return Number(this.config.get<string>('INVITATION_EXPIRES_IN_HOURS') ?? 168);
  }

  /**
   * Shared by create() and resend(): generates a fresh token, supersedes any
   * other still-pending invite for the same email in this org, persists the
   * new row, and emails the link. `inviteUrl` is returned once here — the
   * only place the raw token is ever recoverable, since only its hash is
   * stored (mirrors the fact that the invitee's email already gets it).
   */
  private async issueInvitation(
    authContext: RpcAuthContext,
    email: string,
    role: AssignableTeamRole,
  ): Promise<CreatedInvitationDto> {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: authContext.organizationId },
    });

    // Soft pre-check (Part 7): rejects an obviously-futile invite early. Not
    // the authoritative gate — a pending invitation doesn't consume a seat —
    // so the real enforcement is the lock-protected check in accept() below.
    await this.subscriptions.assertCanAddTeamMember(this.prisma, authContext.organizationId);

    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + this.expiresInHours * 60 * 60_000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      // Supersede any invitation still pending for this email in this org so
      // only one active invite link exists at a time.
      await tx.invitation.updateMany({
        where: { organizationId: authContext.organizationId, email: normalizedEmail, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });

      return tx.invitation.create({
        data: {
          organizationId: authContext.organizationId,
          email: normalizedEmail,
          role,
          tokenHash,
          expiresAt,
          invitedBy: authContext.userId,
        },
      });
    });

    const inviteUrl = `${this.config.get<string>('FRONTEND_URL')}/invite/accept?token=${token}`;
    // Fire-and-forget — MailService.sendMail() never rejects (best-effort
    // side channel, errors are logged internally), so awaiting it here would
    // only risk this RPC response exceeding the gateway's fixed
    // CALL_TIMEOUT_MS on a slow SMTP round-trip, for zero correctness benefit.
    void this.mail.sendInvitationEmail(normalizedEmail, organization.name, role, inviteUrl);

    return { ...toDto(invitation), inviteUrl };
  }

  /**
   * Only a Tenant Owner may invite, and only into their own
   * (`authContext.organizationId`) organization — the org is never taken
   * from client input, so Organization A's owner cannot mint an invitation
   * for Organization B.
   */
  async create(authContext: RpcAuthContext, email: string, role: AssignableTeamRole): Promise<CreatedInvitationDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can invite teammates.');
    }
    if (!ASSIGNABLE_TEAM_ROLES.includes(role)) {
      throw new BadRequestException('Invalid role.');
    }

    return this.issueInvitation(authContext, email, role);
  }

  private async getInvitationInOwnOrg(authContext: RpcAuthContext, invitationId: string): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    // 404, not 403, on a cross-tenant id — same tenant-probing-prevention
    // rationale as MembersService.getMemberInOwnOrg.
    if (!invitation || invitation.organizationId !== authContext.organizationId) {
      throw new NotFoundException('Invitation not found.');
    }
    return invitation;
  }

  /** Only a still-PENDING invitation can be revoked; the org is always the caller's own. */
  async revoke(authContext: RpcAuthContext, invitationId: string): Promise<InvitationDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can revoke invitations.');
    }

    const invitation = await this.getInvitationInOwnOrg(authContext, invitationId);
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Only a pending invitation can be revoked.');
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'REVOKED' },
    });
    return toDto(updated);
  }

  /**
   * Re-issues a new link for a still-PENDING invitation, using its existing
   * email/role (never client-supplied) — the old link stops working the
   * moment the new one is superseded in via issueInvitation().
   */
  async resend(authContext: RpcAuthContext, invitationId: string): Promise<CreatedInvitationDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can resend invitations.');
    }

    const invitation = await this.getInvitationInOwnOrg(authContext, invitationId);
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Only a pending invitation can be resent.');
    }

    return this.issueInvitation(authContext, invitation.email, invitation.role as AssignableTeamRole);
  }

  async list(authContext: RpcAuthContext): Promise<InvitationDto[]> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can view invitations.');
    }

    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId: authContext.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(toDto);
  }

  private async findValidPendingInvitation(token: string): Promise<Invitation> {
    const tokenHash = hashToken(token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new BadRequestException(INVALID_INVITATION_ERROR);
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException(INVALID_INVITATION_ERROR);
    }

    return invitation;
  }

  /** Public: lets an invitee preview what they're accepting before they set a password. */
  async validate(token: string): Promise<InvitationPreviewDto> {
    const invitation = await this.findValidPendingInvitation(token);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: invitation.organizationId },
    });

    return {
      organizationName: organization.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Public: creates the invitee's account. The organization, role, and email
   * all come from the server-side invitation record resolved by the token —
   * never from the request body — so a client cannot request
   * `role: TENANT_OWNER` for an invitation that was created for
   * SUPPORT_AGENT, and cannot join a different organization than the one the
   * invitation belongs to.
   */
  async accept(token: string, name: string, password: string): Promise<{ message: string; email: string }> {
    const invitation = await this.findValidPendingInvitation(token);

    const passwordHash = await argon2.hash(password);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Authoritative, lock-protected check: this is where a seat is
        // actually consumed, so it must run inside this transaction (see
        // TicketsService.create for why).
        await this.subscriptions.assertCanAddTeamMember(tx, invitation.organizationId);

        const newUser = await tx.user.create({
          data: {
            organizationId: invitation.organizationId,
            name: name.trim(),
            email: invitation.email,
            passwordHash,
            role: invitation.role,
            emailVerified: true,
          },
        });

        // Single-use: flip to ACCEPTED inside the same transaction so a
        // concurrent accept attempt can't race past the PENDING check.
        const updated = await tx.invitation.updateMany({
          where: { id: invitation.id, status: 'PENDING' },
          data: { status: 'ACCEPTED' },
        });
        if (updated.count === 0) {
          throw new BadRequestException(INVALID_INVITATION_ERROR);
        }

        // Step 12: let the inviting tenant owner know their invite landed.
        await this.notifications.notify(tx, {
          organizationId: invitation.organizationId,
          recipientIds: [invitation.invitedBy],
          type: NOTIFICATION_TYPES.TEAM_INVITATION_ACCEPTED,
          title: 'Invitation accepted',
          message: `${newUser.name} has joined your organization.`,
          invitationId: invitation.id,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw err;
    }

    return { message: 'Invitation accepted. You can now log in.', email: invitation.email };
  }
}
