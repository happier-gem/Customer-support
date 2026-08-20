"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type AdminUser, type Paginated } from "@/lib/api";
import { buttonClass, cardClass, dangerButtonClass, errorTextClass, inputClass, secondaryButtonClass, selectClass } from "@/lib/ui";

const ROLE_OPTIONS = ["PLATFORM_ADMIN", "TENANT_OWNER", "SUPPORT_AGENT", "CUSTOMER"] as const;

function roleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

export default function UsersPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [result, setResult] = useState<Paginated<AdminUser> | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "DEACTIVATED">("");
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
      const res = await api.listUsers(accessToken, {
        page,
        pageSize: 15,
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, roleFilter, statusFilter]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  async function handleToggleActive(target: AdminUser) {
    if (!accessToken) return;
    setActionError(null);
    setActioningId(target.id);
    try {
      if (target.isActive) {
        await api.deactivateUser(accessToken, target.id);
      } else {
        await api.reactivateUser(accessToken, target.id);
      }
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to update this account.");
    } finally {
      setActioningId(null);
    }
  }

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-foreground">Users</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${inputClass} w-auto min-w-[220px] flex-1`}
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className={`${selectClass} w-auto`}
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <select
          className={`${selectClass} w-auto`}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as "" | "ACTIVE" | "DEACTIVATED");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DEACTIVATED">Deactivated</option>
        </select>
      </div>

      {error && <p className={errorTextClass}>{error}</p>}
      {actionError && <p className={errorTextClass}>{actionError}</p>}

      <div className={cardClass}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !result || result.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Organization</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Email verified</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.data.map((u) => (
                  <tr key={u.id} className="hover:bg-muted">
                    <td className="max-w-[180px] truncate py-2 font-medium text-foreground">{u.name}</td>
                    <td className="max-w-[220px] truncate py-2 text-muted-foreground">{u.email}</td>
                    <td className="py-2 text-muted-foreground">{roleLabel(u.role)}</td>
                    <td className="max-w-[180px] truncate py-2 text-muted-foreground">{u.organizationName}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.isActive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                        }`}
                      >
                        {u.isActive ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.emailVerified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                        }`}
                      >
                        {u.emailVerified ? "Verified" : "Unverified"}
                      </span>
                    </td>
                    <td className="py-2">
                      <button
                        disabled={actioningId === u.id}
                        onClick={() => handleToggleActive(u)}
                        className={u.isActive ? `${dangerButtonClass} w-auto` : `${buttonClass} w-auto! px-3 py-1`}
                      >
                        {actioningId === u.id ? "…" : u.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result && result.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
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
