"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Member, type Paginated, type Subscription, type Ticket, type TicketStatus } from "@/lib/api";
import { cardClass, errorTextClass, formatStatusLabel, priorityBadgeClass, statusBadgeClass } from "@/lib/ui";

const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"];

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [recent, setRecent] = useState<Paginated<Ticket> | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.role === "TENANT_OWNER";

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [recentRes, ...openResults] = await Promise.all([
        api.listTickets(accessToken, { page: 1, limit: 5 }),
        ...OPEN_STATUSES.map((s) => api.listTickets(accessToken, { page: 1, limit: 1, status: s })),
      ]);
      setRecent(recentRes);
      setOpenCount(openResults.reduce((sum, r) => sum + r.pagination.total, 0));

      if (isOwner) {
        const [membersRes, subRes] = await Promise.all([api.listMembers(accessToken), api.getSubscription(accessToken)]);
        setMembers(membersRes);
        setSubscription(subRes);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, isOwner]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
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
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Welcome, {user.name}</h1>

      {error && <p className={errorTextClass}>{error}</p>}

      <div className={`grid gap-4 sm:grid-cols-2 ${isOwner ? "lg:grid-cols-4" : ""}`}>
        <StatTile label="Open tickets" value={loading ? "…" : (openCount ?? 0)} />
        <StatTile label="Total tickets" value={loading ? "…" : (recent?.pagination.total ?? 0)} />
        {isOwner && <StatTile label="Team members" value={loading ? "…" : (members?.length ?? 0)} />}
        {isOwner && <StatTile label="Plan" value={loading ? "…" : (subscription?.plan ?? "—")} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${cardClass} lg:col-span-2`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent tickets</h2>
            <Link href="/tickets" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              View all
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !recent || recent.data.length === 0 ? (
            <p className="text-sm text-gray-500">No tickets yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.data.map((ticket) => (
                <li key={ticket.id}>
                  <Link href={`/tickets/${ticket.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{ticket.title}</p>
                      <p className="text-xs text-gray-500">{ticket.customer.name}</p>
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

        <div className="space-y-4">
          {isOwner && subscription && (
            <div className={cardClass}>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Subscription usage</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Team members</dt>
                  <dd className="text-gray-900">
                    {subscription.usage.teamMembers}
                    {subscription.limits.teamMembers !== null ? ` / ${subscription.limits.teamMembers}` : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Tickets this month</dt>
                  <dd className="text-gray-900">
                    {subscription.usage.monthlyTickets}
                    {subscription.limits.monthlyTickets !== null ? ` / ${subscription.limits.monthlyTickets}` : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Questionnaires</dt>
                  <dd className="text-gray-900">
                    {subscription.usage.feedbackForms}
                    {subscription.limits.feedbackForms !== null ? ` / ${subscription.limits.feedbackForms}` : ""}
                  </dd>
                </div>
              </dl>
              <Link href="/settings/subscription" className="mt-3 block text-sm font-medium text-gray-500 hover:text-gray-900">
                Manage subscription →
              </Link>
            </div>
          )}

          <div className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Quick links</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/feedback" className="font-medium text-gray-700 hover:text-gray-900">
                  Questionnaires
                </Link>
              </li>
              <li>
                <Link href="/analytics" className="font-medium text-gray-700 hover:text-gray-900">
                  Analytics
                </Link>
              </li>
              {isOwner && (
                <>
                  <li>
                    <Link href="/settings/team" className="font-medium text-gray-700 hover:text-gray-900">
                      Team members
                    </Link>
                  </li>
                  <li>
                    <Link href="/settings/customer-access" className="font-medium text-gray-700 hover:text-gray-900">
                      Customer access
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
