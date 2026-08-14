/**
 * Phase 6: the three fixed subscription tiers. Mirrors the Prisma `PlanType`
 * enum. Limits are fixed business constants (not tenant- or database-editable
 * in this phase — see schema.prisma's PlanType doc comment for why there is
 * no separate SubscriptionPlan table yet).
 */
export const PLAN_TYPES = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PRO: 'PRO',
} as const;

export type PlanType = (typeof PLAN_TYPES)[keyof typeof PLAN_TYPES];

export const DEFAULT_PLAN: PlanType = PLAN_TYPES.FREE;

/** `null` means unlimited. */
export interface PlanLimits {
  teamMembers: number | null;
  monthlyTickets: number | null;
  feedbackForms: number | null;
}

/**
 * The assignment's exact required limits — do not change these values.
 * "Team members" means active TENANT_OWNER + SUPPORT_AGENT users (see
 * ASSIGNABLE_TEAM_ROLES in constants/roles.ts), not customers or platform admins.
 */
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: { teamMembers: 2, monthlyTickets: 50, feedbackForms: 0 },
  STARTER: { teamMembers: 10, monthlyTickets: 500, feedbackForms: 5 },
  PRO: { teamMembers: null, monthlyTickets: null, feedbackForms: null },
};

export const PLAN_FEATURES = {
  TEAM_MEMBERS: 'TEAM_MEMBERS',
  MONTHLY_TICKETS: 'MONTHLY_TICKETS',
  FEEDBACK_FORMS: 'FEEDBACK_FORMS',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

export const PLAN_LIMIT_ERROR_CODE = 'PLAN_LIMIT_REACHED';
