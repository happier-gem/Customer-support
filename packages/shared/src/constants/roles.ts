/** User roles, mirroring the Prisma `UserRole` enum. Single source of truth for role strings. */
export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  TENANT_OWNER: 'TENANT_OWNER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  CUSTOMER: 'CUSTOMER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Roles a Tenant Owner may assign to a team member (via invitation or a role
 * change). Deliberately excludes PLATFORM_ADMIN (a platform-level role, never
 * tenant-assignable) and CUSTOMER (customers are not invited teammates).
 */
export const ASSIGNABLE_TEAM_ROLES = [ROLES.TENANT_OWNER, ROLES.SUPPORT_AGENT] as const;
export type AssignableTeamRole = (typeof ASSIGNABLE_TEAM_ROLES)[number];
