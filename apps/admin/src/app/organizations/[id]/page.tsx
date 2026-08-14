"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AdminNav } from "@/components/admin-nav";
import { api, ApiError, type AdminOrganization } from "@/lib/api";
import { buttonClass, cardClass, dangerButtonClass, errorTextClass, planBadgeClass, statusBadgeClass } from "@/lib/ui";

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [org, setOrg] = useState<AdminOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoadError(null);
    try {
      const data = await api.getOrganization(accessToken, params.id);
      setOrg(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to load this organization.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, params.id]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  async function handleToggleSuspend() {
    if (!accessToken || !org) return;
    setActionError(null);
    setActioning(true);
    try {
      const updated = org.isSuspended
        ? await api.activateOrganization(accessToken, org.id)
        : await api.suspendOrganization(accessToken, org.id);
      setOrg(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to update this organization.");
    } finally {
      setActioning(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex flex-1 flex-col bg-gray-50">
        <AdminNav />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user) return null;

  if (loadError || !org) {
    return (
      <div className="flex flex-1 flex-col bg-gray-50">
        <AdminNav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <p className={errorTextClass}>{loadError ?? "Organization not found."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <AdminNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{org.name}</h1>
            <p className="mt-1 text-xs text-gray-400">{org.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={planBadgeClass(org.plan)}>{org.plan}</span>
            <span className={statusBadgeClass(org.isSuspended)}>{org.isSuspended ? "Suspended" : "Active"}</span>
          </div>
        </div>

        {actionError && <p className={errorTextClass}>{actionError}</p>}

        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Overview</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">Timezone</dt>
              <dd className="text-sm font-medium text-gray-900">{org.timezone}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Created</dt>
              <dd className="text-sm font-medium text-gray-900">{new Date(org.createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Active Members</dt>
              <dd className="text-sm font-medium text-gray-900">{org.activeMemberCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Tickets</dt>
              <dd className="text-sm font-medium text-gray-900">{org.ticketCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Feedback Forms</dt>
              <dd className="text-sm font-medium text-gray-900">{org.feedbackFormCount}</dd>
            </div>
          </dl>
        </section>

        <section className={cardClass}>
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Platform Actions</h2>
          <p className="mb-3 text-sm text-gray-500">
            {org.isSuspended
              ? "This organization is suspended — its users cannot sign in until it is reactivated."
              : "Suspending this organization immediately blocks its users from signing in or refreshing an existing session."}
          </p>
          <button
            disabled={actioning}
            onClick={handleToggleSuspend}
            className={org.isSuspended ? `${buttonClass} w-auto px-4` : `${dangerButtonClass} w-auto px-4`}
          >
            {actioning ? "Working…" : org.isSuspended ? "Activate Organization" : "Suspend Organization"}
          </button>
        </section>
      </main>
    </div>
  );
}
