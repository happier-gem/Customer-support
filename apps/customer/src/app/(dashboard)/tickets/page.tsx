"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Paginated, type Ticket, type TicketStatus } from "@/lib/api";
import { useTicketSocket } from "@/lib/use-ticket-socket";
import { buttonClass, cardClass, errorTextClass, formatStatusLabel, priorityBadgeClass, secondaryButtonClass, selectClass, statusBadgeClass } from "@/lib/ui";

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"];

export default function TicketsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [result, setResult] = useState<Paginated<Ticket> | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTickets(accessToken, { page, limit: 10, status: statusFilter || undefined });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, statusFilter]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    load();
  }, [load]);

  const { connected } = useTicketSocket(accessToken, () => {
    // Any create/update/attachment event just refetches the current page —
    // ticket lists are small/paginated, so a full refetch is simpler and
    // still cheap, rather than surgically patching individual rows.
    load();
  });

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
          <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">My Tickets</h1>
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={connected ? "Live updates connected" : "Live updates unavailable"}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/30"}`} />
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <Link href="/tickets/new" className={`${buttonClass} w-auto! px-4`}>
            New Ticket
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <select
            className={`${selectClass} w-auto`}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TicketStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {error && <p className={errorTextClass}>{error}</p>}

        <div className={cardClass}>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !result || result.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets yet. Create your first ticket to get started.</p>
          ) : (
            <ul className="divide-y divide-border">
              {result.data.map((ticket) => (
                <li key={ticket.id}>
                  <Link href={`/tickets/${ticket.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-muted">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {ticket.title} <span className="font-normal text-muted-foreground">#{ticket.id.slice(0, 8)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Opened {new Date(ticket.createdAt).toLocaleDateString()} · Updated{" "}
                        {new Date(ticket.updatedAt).toLocaleDateString()}
                        {ticket.assignedAgent && ` · Agent: ${ticket.assignedAgent.name}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
                      <span className={statusBadgeClass(ticket.status)}>{formatStatusLabel(ticket.status)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {result && result.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {result.pagination.page} of {result.pagination.totalPages} ({result.pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                className={`${secondaryButtonClass} w-auto`}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className={`${secondaryButtonClass} w-auto`}
                disabled={page >= result.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
  );
}
