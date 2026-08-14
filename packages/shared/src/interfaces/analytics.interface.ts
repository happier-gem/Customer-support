/**
 * Phase 7: one bucket of the tickets-created-per-month chart. `month` is a
 * `"YYYY-MM"` key in the organization's configured timezone (Organization.timezone) —
 * see AnalyticsService.ticketsCreatedPerMonth for the exact boundary math, which reuses
 * the same Intl-based timezone conversion Phase 6 uses for the monthly-ticket-limit reset.
 */
export interface MonthlyTicketCountDto {
  /** `"YYYY-MM"`, e.g. `"2026-03"`. */
  month: string;
  count: number;
}

/**
 * The Tenant Owner analytics dashboard (`GET /analytics/overview`). Every field is
 * computed live from the caller's own organization's data — never cached, faked, or
 * combined across tenants.
 */
export interface AnalyticsOverviewDto {
  /**
   * The trailing 12 calendar months ending at (and including) the current month, oldest
   * first, in the organization's timezone. Always exactly 12 entries — a month with no
   * tickets still appears, with `count: 0`.
   */
  ticketsCreatedPerMonth: MonthlyTicketCountDto[];

  /**
   * Average minutes from ticket creation to the first history event authored by a
   * SUPPORT_AGENT (assignment/status-change/update/attachment — whichever comes first),
   * across every ticket in the organization that has one. `null` when no ticket has
   * received an agent response yet — never `0`, which would falsely claim an
   * instant-response average.
   */
  averageResponseTimeMinutes: number | null;

  /**
   * Average of all RATING-question answer values (1-5) across every feedback response in
   * the organization. TEXT answers never contribute. `null` when there are no rating
   * answers yet — never `0`, which would falsely claim a zero satisfaction score.
   */
  customerSatisfactionScore: number | null;

  /** Count of tickets whose current status is not CLOSED. */
  openTickets: number;
  /** Count of tickets whose current status is CLOSED. */
  closedTickets: number;
}
