"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Paginated, type Ticket, type TicketStatus } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  errorTextClass,
  formatStatusLabel,
  priorityBadgeClass,
  statusBadgeClass,
} from "@/lib/ui";

const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"];

export default function DashboardPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [recent, setRecent] = useState<Paginated<Ticket> | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      // `pagination.total` reflects the true count for the query regardless of
      // page size, so a limit:1 request per status is enough to total them up
      // without pulling every row.
      const [recentRes, ...openResults] = await Promise.all([
        api.listTickets(accessToken, { page: 1, limit: 5 }),
        ...OPEN_STATUSES.map((s) => api.listTickets(accessToken, { page: 1, limit: 1, status: s })),
      ]);
      setRecent(recentRes);
      setOpenCount(openResults.reduce((sum, r) => sum + r.pagination.total, 0));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Welcome, {user.name}</h1>
        <Link href="/tickets/new" className={`${buttonClass} w-auto! px-4`}>
          Create Ticket
        </Link>
      </div>

      {error && <p className={errorTextClass}>{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cardClass}>
          <p className="text-sm text-gray-500">Open tickets</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{loading ? "…" : (openCount ?? 0)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-sm text-gray-500">Total tickets</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{loading ? "…" : (recent?.pagination.total ?? 0)}</p>
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent tickets</h2>
          <Link href="/tickets" className="text-sm font-medium text-gray-500 hover:text-gray-900">
            View all
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !recent || recent.data.length === 0 ? (
          <p className="text-sm text-gray-500">No tickets yet. Create your first ticket to get started.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.data.map((ticket) => (
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
    </main>
  );
}
