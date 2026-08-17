"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type SubscriptionPlan } from "@/lib/api";
import { cardClass, errorTextClass, planBadgeClass } from "@/lib/ui";

function formatLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

export default function PlansPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoadError(null);
    try {
      const data = await api.listPlans(accessToken);
      setPlans(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to load plans.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
              <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
    );
  }

  if (!user) return null;

  return (
          <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Subscription Plans</h1>
          <p className="mt-1 text-sm text-gray-500">
            Fixed platform-wide plan tiers. These limits are not editable from this dashboard.
          </p>
        </div>

        {loadError && <p className={errorTextClass}>{loadError}</p>}

        {plans && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map((p) => (
              <section key={p.plan} className={cardClass}>
                <span className={planBadgeClass(p.plan)}>{p.plan}</span>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Team members</dt>
                    <dd className="font-medium text-gray-900">{formatLimit(p.limits.teamMembers)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Tickets / month</dt>
                    <dd className="font-medium text-gray-900">{formatLimit(p.limits.monthlyTickets)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Feedback forms</dt>
                    <dd className="font-medium text-gray-900">{formatLimit(p.limits.feedbackForms)}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
        )}
      </main>
  );
}
