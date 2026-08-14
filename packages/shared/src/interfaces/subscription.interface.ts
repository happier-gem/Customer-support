import type { PlanFeature, PlanLimits, PlanType } from '../constants/subscription';

export interface SubscriptionUsageDto {
  teamMembers: number;
  monthlyTickets: number;
  feedbackForms: number;
}

/** One entry of the static plan catalog returned by `GET /subscription/plans` — no usage, not org-specific. */
export interface SubscriptionPlanDto {
  plan: PlanType;
  limits: PlanLimits;
}

/** The caller's own organization's current plan, limits, and live usage. */
export interface SubscriptionDto {
  organizationId: string;
  plan: PlanType;
  limits: PlanLimits;
  usage: SubscriptionUsageDto;
}

/**
 * Structured body of a 403 thrown when a plan limit blocks an operation.
 * Travels gateway -> frontend verbatim (see RpcErrorPayload.data) so the UI
 * can show a specific, actionable message instead of a generic error.
 */
export interface PlanLimitErrorPayload {
  code: 'PLAN_LIMIT_REACHED';
  feature: PlanFeature;
  plan: PlanType;
  limit: number;
  currentUsage: number;
  message: string;
}
