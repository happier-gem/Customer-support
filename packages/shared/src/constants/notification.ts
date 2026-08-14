/**
 * Phase 8: centralized notification event types. Mirrors the Prisma `NotificationType`
 * enum. Every value here corresponds to a real event already generated elsewhere in the
 * app (ticket lifecycle, team management, feedback, plan limits) — see NotificationsService's
 * callers for exactly where each is created.
 */
export const NOTIFICATION_TYPES = {
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_ASSIGNED: 'TICKET_ASSIGNED',
  TICKET_STATUS_CHANGED: 'TICKET_STATUS_CHANGED',
  TICKET_RESOLVED: 'TICKET_RESOLVED',
  TICKET_CLOSED: 'TICKET_CLOSED',
  TEAM_INVITATION_ACCEPTED: 'TEAM_INVITATION_ACCEPTED',
  TEAM_MEMBER_ROLE_CHANGED: 'TEAM_MEMBER_ROLE_CHANGED',
  TEAM_MEMBER_REMOVED: 'TEAM_MEMBER_REMOVED',
  FEEDBACK_SUBMITTED: 'FEEDBACK_SUBMITTED',
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_MIN_PAGE_SIZE = 1;
export const NOTIFICATION_MAX_PAGE_SIZE = 100;
export const NOTIFICATION_DEFAULT_PAGE_SIZE = 20;
