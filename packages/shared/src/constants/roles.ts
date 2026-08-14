/** User roles, mirroring the Prisma `UserRole` enum. Single source of truth for role strings. */
export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  TENANT_OWNER: 'TENANT_OWNER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  CUSTOMER: 'CUSTOMER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
