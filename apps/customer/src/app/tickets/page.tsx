"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Paginated, type Ticket, type TicketStatus } from "@/lib/api";
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

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">My Tickets</h1>
          <Link href="/tickets/new" className={`${buttonClass} w-auto px-4`}>
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
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !result || result.data.length === 0 ? (
            <p className="text-sm text-gray-500">No tickets yet. Create your first ticket to get started.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {result.data.map((ticket) => (
                <li key={ticket.id}>
                  <Link href={`/tickets/${ticket.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{ticket.title}</p>
                      <p className="text-xs text-gray-500">Opened {new Date(ticket.createdAt).toLocaleDateString()}</p>
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
          <div className="flex items-center justify-between text-sm text-gray-500">
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
    </div>
  );
}
