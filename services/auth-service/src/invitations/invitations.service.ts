import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invitation, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ASSIGNABLE_TEAM_ROLES,
  AssignableTeamRole,
  InvitationDto,
  InvitationPreviewDto,
  ROLES,
  RpcAuthContext,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { generateSecureToken, hashToken } from '../auth/utils/token.util';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

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
  ) {}

  private get expiresInHours(): number {
    return Number(this.config.get<string>('INVITATION_EXPIRES_IN_HOURS') ?? 168);
  }

  /**
   * Only a Tenant Owner may invite, and only into their own
   * (`authContext.organizationId`) organization — the org is never taken
   * from client input, so Organization A's owner cannot mint an invitation
   * for Organization B.
   */
  async create(authContext: RpcAuthContext, email: string, role: AssignableTeamRole): Promise<InvitationDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can invite teammates.');
    }
    if (!ASSIGNABLE_TEAM_ROLES.includes(role)) {
      throw new BadRequestException('Invalid role.');
    }

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
    await this.mail.sendInvitationEmail(normalizedEmail, organization.name, role, inviteUrl);

    return toDto(invitation);
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

        await tx.user.create({
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
