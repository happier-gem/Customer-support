import type { Role } from '../constants/roles';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

/** Owner-facing view of an invitation their organization sent. */
export interface InvitationDto {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/**
 * Public-facing preview shown to an invitee before they accept — deliberately
 * excludes the invitation id, token hash, and inviter identity. Never trust a
 * client to supply organizationId/role/email when accepting; the accept flow
 * must re-derive them from the token server-side.
 */
export interface InvitationPreviewDto {
  organizationName: string;
  email: string;
  role: Role;
  expiresAt: string;
}

/**
 * Returned only from create/resend — a one-time reveal of the invite link,
 * mirroring the fact that the invitee's email already receives this same
 * link. `list()` never includes this field: the raw token is never
 * recoverable afterward, only its hash is stored.
 */
export interface CreatedInvitationDto extends InvitationDto {
  inviteUrl: string;
}
