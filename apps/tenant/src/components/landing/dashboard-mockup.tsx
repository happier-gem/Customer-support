import { Ticket, CheckCircle2, Star, Clock } from "lucide-react";
import { statusBadgeClass, priorityBadgeClass } from "@/lib/ui";

const STATS = [
  { label: "Open Tickets", value: "24", icon: Ticket, tone: "text-info" },
  { label: "Resolved This Week", value: "138", icon: CheckCircle2, tone: "text-success" },
  { label: "Avg. Response Time", value: "2h 18m", icon: Clock, tone: "text-warning" },
  { label: "Customer Satisfaction", value: "94%", icon: Star, tone: "text-primary" },
];

const TICKETS = [
  { title: "Checkout fails on mobile", status: "OPEN", priority: "URGENT" },
  { title: "Feature request: dark mode", status: "IN_PROGRESS", priority: "LOW" },
  { title: "Invoice discrepancy", status: "RESOLVED", priority: "MEDIUM" },
];

/**
 * Static illustrative preview for the marketing hero — mirrors the shape of
 * the real dashboard/tickets views (same status/priority badge classes as
 * the authenticated app) but renders fixed sample data. Not wired to any
 * API; purely decorative.
 */
export function DashboardMockup() {
  return (
    <div
      className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg shadow-primary/10 sm:p-5"
      aria-hidden="true"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-blue-600 text-xs font-bold text-white">
            A
          </span>
          <span className="text-sm font-semibold text-foreground">Acme Corp</span>
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Live</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        {STATS.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-background p-3">
            <stat.icon className={`h-4 w-4 ${stat.tone}`} />
            <p className="mt-1.5 text-lg font-semibold text-foreground">{stat.value}</p>
            <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Recent Tickets</p>
        {TICKETS.map((ticket) => (
          <div
            key={ticket.title}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
          >
            <span className="truncate text-xs font-medium text-foreground">{ticket.title}</span>
            <div className="flex shrink-0 gap-1.5">
              <span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
              <span className={statusBadgeClass(ticket.status)}>{ticket.status.replace(/_/g, " ")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
