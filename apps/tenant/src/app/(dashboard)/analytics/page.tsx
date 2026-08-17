"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { MonthlyTicketsChart } from "@/components/monthly-tickets-chart";
import { api, ApiError, type AnalyticsOverview } from "@/lib/api";
import { cardClass, errorTextClass, formatDurationMinutes } from "@/lib/ui";

function StarRating({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <span aria-hidden className="text-lg leading-none text-amber-500">
      {Array.from({ length: 5 }, (_, i) => (i < rounded ? "★" : "☆")).join("")}
    </span>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && user && user.role !== "TENANT_OWNER") {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setLoadError(null);
    try {
      const data = await api.getAnalyticsOverview(accessToken);
      setOverview(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "TENANT_OWNER") {
      loadData();
    }
  }, [status, user, loadData]);

  if (status === "loading" || (status === "authenticated" && user?.role === "TENANT_OWNER" && loading)) {
    return (
              <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading analytics…</p>
        </main>
    );
  }

  if (!user || user.role !== "TENANT_OWNER") {
    return null;
  }

  if (loadError) {
    return (
              <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">Analytics</h1>
          <p className={errorTextClass}>Unable to load analytics. {loadError}</p>
        </main>
    );
  }

  if (!overview) {
    return null;
  }

  const hasTicketData = overview.ticketsCreatedPerMonth.some((m) => m.count > 0);

  return (
          <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>

        <section className={cardClass}>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Tickets Created</h2>
          {hasTicketData ? (
            <MonthlyTicketsChart data={overview.ticketsCreatedPerMonth} />
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">No ticket data yet.</p>
          )}
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <section className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Average Response Time</h2>
            {overview.averageResponseTimeMinutes === null ? (
              <p className="text-sm text-gray-500">No agent responses yet.</p>
            ) : (
              <p className="text-2xl font-semibold text-gray-900">{formatDurationMinutes(overview.averageResponseTimeMinutes)}</p>
            )}
          </section>

          <section className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Customer Satisfaction</h2>
            {overview.customerSatisfactionScore === null ? (
              <p className="text-sm text-gray-500">No rating data yet.</p>
            ) : (
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-semibold text-gray-900">{overview.customerSatisfactionScore.toFixed(1)} / 5</p>
                <StarRating score={overview.customerSatisfactionScore} />
              </div>
            )}
          </section>
        </div>

        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Tickets</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-semibold text-gray-900">{overview.openTickets}</p>
              <p className="text-sm text-gray-500">Open</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{overview.closedTickets}</p>
              <p className="text-sm text-gray-500">Closed</p>
            </div>
          </div>
        </section>
      </main>
  );
}
