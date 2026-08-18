import type { PlanType } from '../constants/subscription';
import type { Role } from '../constants/roles';

/**
 * Phase 9: platform-level view of one organization — used by both `GET /admin/organizations`
 * (list) and `GET /admin/organizations/:id` (detail); the field set the assignment asks for
 * is identical in both places, so there is deliberately no separate "detail" shape. Usage
 * numbers are always computed live from the database, the same discipline as
 * SubscriptionUsageDto and AnalyticsOverviewDto. Never includes tenant-private data (ticket
 * contents, member identities, feedback answers) — only counts a platform admin needs to
 * manage the tenant, not to read it.
 */
export interface AdminOrganizationDto {
  id: string;
  name: string;
  plan: PlanType;
  timezone: string;
  isSuspended: boolean;
  activeMemberCount: number;
  ticketCount: number;
  feedbackFormCount: number;
  createdAt: string;
}

/** Phase 9: platform-wide aggregates for the admin dashboard — never a per-tenant number. */
export interface PlatformStatsDto {
  organizations: {
    total: number;
    active: number;
    suspended: number;
  };
  /** Organization count per plan tier. */
  plans: Record<PlanType, number>;
  usage: {
    /** Tickets created across every organization in the current UTC calendar month. */
    ticketsThisMonth: number;
    feedbackForms: number;
    activeTeamMembers: number;
  };
}

/**
 * Phase 10: platform-level view of one user account — used by `GET /admin/users`.
 * Never includes passwordHash, OTP hash/attempts, password-reset token hash,
 * refresh-token hash, or any other secret — only what a platform admin needs
 * to find and (de)activate an account.
 */
export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}
