"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AdminNav } from "@/components/admin-nav";
import { api, ApiError, type PlatformStats } from "@/lib/api";
import { cardClass, errorTextClass } from "@/lib/ui";

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

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const loadStats = useCallback(async () => {
    if (!accessToken) return;
    setLoadError(null);
    try {
      const data = await api.getPlatformStats(accessToken);
      setStats(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to load platform statistics.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "authenticated") loadStats();
  }, [status, loadStats]);

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

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <AdminNav />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Platform Overview</h1>

        {loadError && <p className={errorTextClass}>{loadError}</p>}

        {stats && (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Organizations</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Total" value={stats.organizations.total} />
                <StatTile label="Active" value={stats.organizations.active} />
                <StatTile label="Suspended" value={stats.organizations.suspended} />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Plans</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Free" value={stats.plans.FREE} />
                <StatTile label="Starter" value={stats.plans.STARTER} />
                <StatTile label="Pro" value={stats.plans.PRO} />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Platform Usage</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Tickets this month" value={stats.usage.ticketsThisMonth} />
                <StatTile label="Feedback forms" value={stats.usage.feedbackForms} />
                <StatTile label="Active team members" value={stats.usage.activeTeamMembers} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
