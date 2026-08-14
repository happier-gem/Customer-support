import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AnalyticsOverviewDto,
  FEEDBACK_QUESTION_TYPES,
  MonthlyTicketCountDto,
  ROLES,
  RpcAuthContext,
  TICKET_STATUSES,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { monthKeysInTimezone, startOfMonthInTimezone } from '../subscriptions/month-boundary.util';

/** Rolling reporting window for the tickets-created-per-month chart (Part 5/Step 5): the
 *  current month plus the 11 preceding it, so the chart always shows a full year of
 *  trend regardless of what calendar month it is "today". */
const CHART_MONTHS = 12;

/**
 * Phase 7: Tenant Owner analytics, computed live from the same source-of-truth tables
 * every other module writes to (Ticket, TicketHistory, FeedbackAnswer) — no separate
 * analytics tables, no cached/precomputed numbers. Every query is scoped by
 * `authContext.organizationId` from the verified JWT, the same discipline as
 * TicketsService/FeedbackService/SubscriptionsService: a client can never see another
 * tenant's analytics by any route/query/body parameter, because none of these methods
 * accept an organizationId argument from outside the auth context.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(authContext: RpcAuthContext): Promise<AnalyticsOverviewDto> {
    if (authContext.role !== ROLES.TENANT_OWNER) {
      throw new ForbiddenException('Only a tenant owner can view analytics.');
    }

    const organizationId = authContext.organizationId;
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });

    const [ticketsCreatedPerMonth, averageResponseTimeMinutes, customerSatisfactionScore, { openTickets, closedTickets }] =
      await Promise.all([
        this.ticketsCreatedPerMonth(organizationId, org.timezone),
        this.averageResponseTimeMinutes(organizationId),
        this.customerSatisfactionScore(organizationId),
        this.openClosedCounts(organizationId),
      ]);

    return { ticketsCreatedPerMonth, averageResponseTimeMinutes, customerSatisfactionScore, openTickets, closedTickets };
  }

  /**
   * Step 5: real per-month ticket counts from `Ticket.createdAt`, bucketed on calendar-month
   * boundaries in the organization's configured timezone (mirrors the Phase 6 monthly-limit
   * reset in subscriptions/month-boundary.util.ts, so "this month" means the same thing in
   * both places). Aggregated entirely in Postgres via `AT TIME ZONE` + `GROUP BY` — the
   * ticket rows themselves are never pulled into Node. Every one of the 12 buckets is
   * always present (zero-filled) so the chart never silently drops an empty month.
   */
  private async ticketsCreatedPerMonth(organizationId: string, timezone: string): Promise<MonthlyTicketCountDto[]> {
    const monthKeys = monthKeysInTimezone(timezone, CHART_MONTHS);
    const rangeStart = startOfMonthInTimezone(timezone, CHART_MONTHS - 1);

    const rows = await this.prisma.$queryRaw<{ month: string; count: number }[]>`
      SELECT
        to_char((t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM') AS month,
        COUNT(*)::int AS count
      FROM tickets t
      WHERE t."organizationId" = ${organizationId} AND t."createdAt" >= ${rangeStart}
      GROUP BY month
    `;

    const countsByMonth = new Map(rows.map((row) => [row.month, row.count]));
    return monthKeys.map((month) => ({ month, count: countsByMonth.get(month) ?? 0 }));
  }

  /**
   * Step 6: "first meaningful Support Agent response" is defined as the earliest
   * TicketHistory event on a ticket whose actor is a SUPPORT_AGENT — covers however that
   * agent first touched the ticket (self-assignment, a status change, an edit, or an
   * attachment), whichever happened first. This deliberately excludes assignment *by the
   * Tenant Owner* (actor role TENANT_OWNER): an owner routing a ticket to an agent is
   * administrative triage, not the agent's own response to the customer. A ticket with no
   * such event is excluded from the average entirely (not treated as 0), via the `LATERAL`
   * join only ever contributing a row when a match exists.
   *
   * Computed with a single `LATERAL` join so Postgres finds each ticket's first qualifying
   * history row using the existing `ticket_history(ticketId, createdAt)` index, then
   * averages in the database — no per-ticket round trips, no ticket/history rows fetched
   * into Node.
   */
  private async averageResponseTimeMinutes(organizationId: string): Promise<number | null> {
    const [result] = await this.prisma.$queryRaw<{ avg_minutes: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (first_agent_event."createdAt" - t."createdAt")) / 60.0)::float8 AS avg_minutes
      FROM tickets t
      JOIN LATERAL (
        SELECT th."createdAt"
        FROM ticket_history th
        JOIN users u ON u.id = th."actorId"
        WHERE th."ticketId" = t.id AND u.role = 'SUPPORT_AGENT'
        ORDER BY th."createdAt" ASC
        LIMIT 1
      ) first_agent_event ON true
      WHERE t."organizationId" = ${organizationId}
    `;
    if (result?.avg_minutes === null || result?.avg_minutes === undefined) return null;
    return Math.round(result.avg_minutes * 100) / 100;
  }

  /**
   * Step 7: average of RATING-question answers only — TEXT answers never have a
   * `ratingValue`, so filtering on the question's type (not just non-null `ratingValue`)
   * makes that exclusion explicit rather than incidental. `null` (never `0`) when the
   * organization has no rating answers yet.
   */
  private async customerSatisfactionScore(organizationId: string): Promise<number | null> {
    const aggregate = await this.prisma.feedbackAnswer.aggregate({
      where: {
        organizationId,
        ratingValue: { not: null },
        question: { type: FEEDBACK_QUESTION_TYPES.RATING },
      },
      _avg: { ratingValue: true },
    });
    if (aggregate._avg.ratingValue === null) return null;
    return Math.round(aggregate._avg.ratingValue * 100) / 100;
  }

  /** Step 8: CLOSED is the only terminal status; every other status counts as open/active. */
  private async openClosedCounts(organizationId: string): Promise<{ openTickets: number; closedTickets: number }> {
    const grouped = await this.prisma.ticket.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: { _all: true },
    });

    let openTickets = 0;
    let closedTickets = 0;
    for (const row of grouped) {
      if (row.status === TICKET_STATUSES.CLOSED) {
        closedTickets += row._count._all;
      } else {
        openTickets += row._count._all;
      }
    }
    return { openTickets, closedTickets };
  }
}
