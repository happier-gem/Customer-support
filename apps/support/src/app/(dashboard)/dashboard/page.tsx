"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { api, ApiError, type Paginated, type Ticket } from "@/lib/api";
import {
  cardClass,
  errorTextClass,
  formatStatusLabel,
  priorityBadgeClass,
  statusBadgeClass,
} from "@/lib/ui";

export default function DashboardPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();
  const { organization } = useOrganization();

  const [unassignedCount, setUnassignedCount] = useState<number | null>(null);
  const [assignedToMeCount, setAssignedToMeCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<Paginated<Ticket> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [unassigned, mine, recentRes] = await Promise.all([
        api.listTickets(accessToken, { page: 1, limit: 1, status: "OPEN" }),
        api.listTickets(accessToken, { page: 1, limit: 1, assigneeId: "me" }),
        api.listTickets(accessToken, { page: 1, limit: 5 }),
      ]);
      setUnassignedCount(unassigned.pagination.total);
      setAssignedToMeCount(mine.pagination.total);
      setRecent(recentRes);
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Welcome, {user.name}</h1>
        {organization && <p className="text-sm text-muted-foreground">{organization.name}</p>}
      </div>

      {error && <p className={errorTextClass}>{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cardClass}>
          <p className="text-sm text-muted-foreground">Open tickets</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{loading ? "…" : (unassignedCount ?? 0)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-sm text-muted-foreground">Assigned to me</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{loading ? "…" : (assignedToMeCount ?? 0)}</p>
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent tickets</h2>
          <Link href="/tickets" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !recent || recent.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tickets yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.data.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/tickets/${ticket.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-muted">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground">{ticket.customer.name}</p>
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
