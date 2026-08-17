"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Paginated, type Ticket, type TicketPriority, type TicketStatus } from "@/lib/api";
import { useTicketSocket } from "@/lib/use-ticket-socket";
import {
  buttonClass,
  cardClass,
  errorTextClass,
  formatStatusLabel,
  inputClass,
  priorityBadgeClass,
  secondaryButtonClass,
  selectClass,
  statusBadgeClass,
} from "@/lib/ui";

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"];
const PRIORITY_OPTIONS: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function TicketsDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, accessToken, status } = useAuth();

  const [result, setResult] = useState<Paginated<Ticket> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState<"" | "me">(searchParams.get("assignee") === "me" ? "me" : "");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTickets(accessToken, {
        page,
        limit: 15,
        search: search || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        assigneeId: assigneeFilter || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, statusFilter, priorityFilter, assigneeFilter]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setAssigneeFilter(searchParams.get("assignee") === "me" ? "me" : "");
    setPage(1);
  }, [searchParams]);

  const { connected } = useTicketSocket(accessToken, () => {
    load();
  });

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
          <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-8">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">Tickets</h1>
          <span
            className="flex items-center gap-1 text-xs text-gray-400"
            title={connected ? "Live updates connected" : "Live updates unavailable"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`} />
            {connected ? "Live" : "Offline"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            className={`${inputClass} w-auto min-w-[220px] flex-1`}
            placeholder="Search title or description…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
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
          <select
            className={`${selectClass} w-auto`}
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as TicketPriority | "");
              setPage(1);
            }}
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className={`${selectClass} w-auto`}
            value={assigneeFilter}
            onChange={(e) => {
              setAssigneeFilter(e.target.value as "" | "me");
              setPage(1);
            }}
          >
            <option value="">All assignees</option>
            <option value="me">Assigned to me</option>
          </select>
        </div>

        {error && <p className={errorTextClass}>{error}</p>}

        <div className={cardClass}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !result || result.data.length === 0 ? (
            <p className="text-sm text-gray-500">No tickets match these filters.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="pb-2 font-medium">ID</th>
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.data.map((ticket) => (
                  <tr key={ticket.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/tickets/${ticket.id}`)}>
                    <td className="py-2 pr-2 font-mono text-xs text-gray-400">#{ticket.id.slice(0, 8)}</td>
                    <td className="max-w-[240px] truncate py-2 font-medium text-gray-900">
                      <Link href={`/tickets/${ticket.id}`}>{ticket.title}</Link>
                    </td>
                    <td className="py-2 text-gray-600">{ticket.customer.name}</td>
                    <td className="py-2 text-gray-600">{ticket.assignedAgent?.name ?? "—"}</td>
                    <td className="py-2">
                      <span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
                    </td>
                    <td className="py-2">
                      <span className={statusBadgeClass(ticket.status)}>{formatStatusLabel(ticket.status)}</span>
                    </td>
                    <td className="py-2 text-xs text-gray-500">{new Date(ticket.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {result && result.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Page {result.pagination.page} of {result.pagination.totalPages} ({result.pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button className={`${secondaryButtonClass} w-auto`} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <button
                className={`${buttonClass} w-auto! px-4`}
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

export default function TicketsDashboardPage() {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center"><p className="text-sm text-gray-500">Loading…</p></main>}>
      <TicketsDashboardContent />
    </Suspense>
  );
}
