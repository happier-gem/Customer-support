"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardNav } from "@/components/dashboard-nav";
import { api, ApiError, type PlanType, type Subscription, type SubscriptionPlan } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

const PLAN_ORDER: PlanType[] = ["FREE", "STARTER", "PRO"];

function formatLimit(value: number | null): string {
  return value === null ? "Unlimited" : String(value);
}

function usageBarClass(usage: number, limit: number | null): string {
  if (limit === null) return "bg-gray-900";
  if (usage >= limit) return "bg-red-500";
  if (usage / limit >= 0.8) return "bg-amber-500";
  return "bg-gray-900";
}

function UsageRow({ label, usage, limit }: { label: string; usage: number; limit: number | null }) {
  const pct = limit === null ? 100 : Math.min(100, Math.round((usage / Math.max(limit, 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">
          {usage} / {formatLimit(limit)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${usageBarClass(usage, limit)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [changingTo, setChangingTo] = useState<PlanType | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);

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
      const [sub, planList] = await Promise.all([api.getSubscription(accessToken), api.listPlans(accessToken)]);
      setSubscription(sub);
      setPlans(planList);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load subscription.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "TENANT_OWNER") {
      loadData();
    }
  }, [status, user, loadData]);

  async function handleChangePlan(plan: PlanType) {
    if (!accessToken || plan === subscription?.plan) return;
    setChangeError(null);
    setChangeSuccess(null);
    setChangingTo(plan);
    try {
      const updated = await api.changePlan(accessToken, plan);
      setSubscription(updated);
      setChangeSuccess(`Your plan is now ${plan}.`);
    } catch (err) {
      setChangeError(err instanceof ApiError ? err.message : "Failed to change plan.");
    } finally {
      setChangingTo(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col bg-gray-50">
        <DashboardNav />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user || user.role !== "TENANT_OWNER" || !subscription) {
    return null;
  }

  const orderedPlans = [...plans].sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));
  const currentIndex = PLAN_ORDER.indexOf(subscription.plan);

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Subscription</h1>

        <section className={`${cardClass} space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Current plan</h2>
            <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium text-white">{subscription.plan}</span>
          </div>
          <div className="space-y-3">
            <UsageRow label="Team members" usage={subscription.usage.teamMembers} limit={subscription.limits.teamMembers} />
            <UsageRow label="Tickets this month" usage={subscription.usage.monthlyTickets} limit={subscription.limits.monthlyTickets} />
            <UsageRow label="Feedback forms" usage={subscription.usage.feedbackForms} limit={subscription.limits.feedbackForms} />
          </div>
          {changeError && <p className={errorTextClass}>{changeError}</p>}
          {changeSuccess && <p className={successTextClass}>{changeSuccess}</p>}
        </section>

        {loadError && <p className={errorTextClass}>{loadError}</p>}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Available plans</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {orderedPlans.map((plan) => {
              const isCurrent = plan.plan === subscription.plan;
              const planIndex = PLAN_ORDER.indexOf(plan.plan);
              const action = isCurrent ? "current" : planIndex > currentIndex ? "upgrade" : "downgrade";
              return (
                <div key={plan.plan} className={`${cardClass} flex flex-col gap-4 ${isCurrent ? "ring-2 ring-gray-900" : ""}`}>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{plan.plan}</h3>
                  </div>
                  <ul className="flex-1 space-y-1 text-sm text-gray-600">
                    <li>{formatLimit(plan.limits.teamMembers)} team members</li>
                    <li>{formatLimit(plan.limits.monthlyTickets)} tickets/month</li>
                    <li>{formatLimit(plan.limits.feedbackForms)} feedback forms</li>
                  </ul>
                  {isCurrent ? (
                    <span className={`${secondaryButtonClass} pointer-events-none text-center`}>Current Plan</span>
                  ) : (
                    <button
                      type="button"
                      disabled={changingTo !== null}
                      onClick={() => handleChangePlan(plan.plan)}
                      className={action === "upgrade" ? buttonClass : secondaryButtonClass}
                    >
                      {changingTo === plan.plan ? "Switching…" : action === "upgrade" ? `Upgrade to ${plan.plan}` : `Downgrade to ${plan.plan}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            This is a demo plan switch — no payment is processed. Downgrading never deletes existing team members, tickets, or feedback
            forms; it only blocks creating new ones once you&apos;re over the new plan&apos;s limit.
          </p>
        </section>
      </main>
    </div>
  );
}
