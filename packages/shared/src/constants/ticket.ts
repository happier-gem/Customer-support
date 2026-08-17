/** Ticket lifecycle status. Mirrors the Prisma `TicketStatus` enum. */
export const TICKET_STATUSES = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_FOR_CUSTOMER: 'WAITING_FOR_CUSTOMER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type TicketStatus = (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];

/** Controlled ticket priority. Mirrors the Prisma `TicketPriority` enum. */
export const TICKET_PRIORITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[keyof typeof TICKET_PRIORITIES];

export const DEFAULT_TICKET_PRIORITY: TicketPriority = TICKET_PRIORITIES.MEDIUM;

/** Ticket history event types. Mirrors the Prisma `TicketHistoryAction` enum. */
export const TICKET_HISTORY_ACTIONS = {
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  UNASSIGNED: 'UNASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  UPDATED: 'UPDATED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  MESSAGE_ADDED: 'MESSAGE_ADDED',
} as const;

export type TicketHistoryAction = (typeof TICKET_HISTORY_ACTIONS)[keyof typeof TICKET_HISTORY_ACTIONS];

/**
 * Single source of truth for which status transitions are legal, so the rule
 * lives in one place (TicketsService.changeStatus) instead of being
 * reimplemented per-controller. The assignment's required workflow is linear
 * (OPEN → IN_PROGRESS → WAITING_FOR_CUSTOMER → RESOLVED → CLOSED); on top of
 * that we allow the two realistic backward moves a working queue needs —
 * an agent resolving directly from IN_PROGRESS without waiting on the
 * customer, and reopening a RESOLVED ticket that turns out not to be fixed —
 * while still rejecting arbitrary jumps like OPEN → RESOLVED or OPEN → CLOSED.
 * CLOSED is terminal: a closed ticket cannot be transitioned at all.
 */
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TICKET_STATUSES.OPEN]: [TICKET_STATUSES.IN_PROGRESS],
  [TICKET_STATUSES.IN_PROGRESS]: [TICKET_STATUSES.WAITING_FOR_CUSTOMER, TICKET_STATUSES.RESOLVED],
  [TICKET_STATUSES.WAITING_FOR_CUSTOMER]: [TICKET_STATUSES.IN_PROGRESS, TICKET_STATUSES.RESOLVED],
  [TICKET_STATUSES.RESOLVED]: [TICKET_STATUSES.CLOSED, TICKET_STATUSES.IN_PROGRESS],
  [TICKET_STATUSES.CLOSED]: [],
};

export function isValidTicketStatusTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const TICKET_MIN_PAGE_SIZE = 1;
export const TICKET_MAX_PAGE_SIZE = 100;
export const TICKET_DEFAULT_PAGE_SIZE = 20;
