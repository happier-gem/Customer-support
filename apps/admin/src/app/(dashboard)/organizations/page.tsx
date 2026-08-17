"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AdminNav } from "@/components/admin-nav";
import { api, ApiError, type AdminOrganization, type Paginated, type PlanType } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  errorTextClass,
  inputClass,
  planBadgeClass,
  secondaryButtonClass,
  selectClass,
  statusBadgeClass,
} from "@/lib/ui";

const PLAN_OPTIONS: PlanType[] = ["FREE", "STARTER", "PRO"];

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [result, setResult] = useState<Paginated<AdminOrganization> | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanType | "">("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "SUSPENDED">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listOrganizations(accessToken, {
        page,
        pageSize: 15,
        search: search || undefined,
        plan: planFilter || undefined,
        status: statusFilter || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, planFilter, statusFilter]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  async function handleToggleSuspend(org: AdminOrganization) {
    if (!accessToken) return;
    setActionError(null);
    setActioningId(org.id);
    try {
      if (org.isSuspended) {
        await api.activateOrganization(accessToken, org.id);
      } else {
        await api.suspendOrganization(accessToken, org.id);
      }
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to update this organization.");
    } finally {
      setActioningId(null);
    }
  }

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <AdminNav />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Organizations</h1>

        <div className="flex flex-wrap items-center gap-3">
          <input
            className={`${inputClass} w-auto min-w-[220px] flex-1`}
            placeholder="Search by organization name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className={`${selectClass} w-auto`}
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value as PlanType | "");
              setPage(1);
            }}
          >
            <option value="">All plans</option>
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className={`${selectClass} w-auto`}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | "ACTIVE" | "SUSPENDED");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        {error && <p className={errorTextClass}>{error}</p>}
        {actionError && <p className={errorTextClass}>{actionError}</p>}

        <div className={cardClass}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !result || result.data.length === 0 ? (
            <p className="text-sm text-gray-500">No organizations match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="pb-2 font-medium">Organization</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Members</th>
                    <th className="pb-2 font-medium">Tickets</th>
                    <th className="pb-2 font-medium">Feedback Forms</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Created</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.data.map((org) => (
                    <tr key={org.id} className="hover:bg-gray-50">
                      <td className="max-w-[220px] truncate py-2 font-medium text-gray-900">
                        <Link href={`/organizations/${org.id}`} className="hover:underline">
                          {org.name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <span className={planBadgeClass(org.plan)}>{org.plan}</span>
                      </td>
                      <td className="py-2 text-gray-600">{org.activeMemberCount}</td>
                      <td className="py-2 text-gray-600">{org.ticketCount}</td>
                      <td className="py-2 text-gray-600">{org.feedbackFormCount}</td>
                      <td className="py-2">
                        <span className={statusBadgeClass(org.isSuspended)}>{org.isSuspended ? "Suspended" : "Active"}</span>
                      </td>
                      <td className="py-2 whitespace-nowrap text-gray-600">{new Date(org.createdAt).toLocaleDateString()}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <Link href={`/organizations/${org.id}`} className={`${secondaryButtonClass} w-auto px-3 py-1`}>
                            View
                          </Link>
                          <button
                            disabled={actioningId === org.id}
                            onClick={() => handleToggleSuspend(org)}
                            className={org.isSuspended ? `${buttonClass} w-auto px-3 py-1` : `${dangerButtonClass} w-auto`}
                          >
                            {actioningId === org.id ? "…" : org.isSuspended ? "Activate" : "Suspend"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                className={`${buttonClass} w-auto px-4`}
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
