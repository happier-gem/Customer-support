/**
 * Phase 9: an organization's platform-level status, derived from `Organization.isSuspended`
 * — distinct from a ticket's/form's own ACTIVE/INACTIVE status enums. Used only by the
 * admin organization-list status filter.
 */
export const ORGANIZATION_STATUSES = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[keyof typeof ORGANIZATION_STATUSES];

export const ADMIN_ORG_MIN_PAGE_SIZE = 1;
export const ADMIN_ORG_MAX_PAGE_SIZE = 100;
export const ADMIN_ORG_DEFAULT_PAGE_SIZE = 20;

/**
 * Phase 10: an account's platform-level status, derived from `User.isActive`
 * — distinct from ORGANIZATION_STATUSES above, which is org-level. Used only
 * by the admin user-list status filter.
 */
export const ACCOUNT_STATUSES = {
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES];

export const ADMIN_USER_MAX_PAGE_SIZE = 100;
export const ADMIN_USER_DEFAULT_PAGE_SIZE = 20;
