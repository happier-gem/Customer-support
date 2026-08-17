"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type PlanLimits, type PlanType, type SubscriptionPlan } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, inputClass, labelClass, planBadgeClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

function formatLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

interface DraftLimits {
  teamMembers: string;
  monthlyTickets: string;
  feedbackForms: string;
}

function toDraft(limits: PlanLimits): DraftLimits {
  return {
    teamMembers: limits.teamMembers === null ? "" : String(limits.teamMembers),
    monthlyTickets: limits.monthlyTickets === null ? "" : String(limits.monthlyTickets),
    feedbackForms: limits.feedbackForms === null ? "" : String(limits.feedbackForms),
  };
}

function draftToLimits(draft: DraftLimits): PlanLimits {
  const parse = (v: string) => (v.trim() === "" ? null : Math.max(1, Math.floor(Number(v))));
  return {
    teamMembers: parse(draft.teamMembers),
    monthlyTickets: parse(draft.monthlyTickets),
    feedbackForms: parse(draft.feedbackForms),
  };
}

export default function PlansPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingPlan, setEditingPlan] = useState<PlanType | null>(null);
  const [draft, setDraft] = useState<DraftLimits>({ teamMembers: "", monthlyTickets: "", feedbackForms: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedPlan, setSavedPlan] = useState<PlanType | null>(null);

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

  function startEditing(p: SubscriptionPlan) {
    setEditingPlan(p.plan);
    setDraft(toDraft(p.limits));
    setSaveError(null);
    setSavedPlan(null);
  }

  function cancelEditing() {
    setEditingPlan(null);
    setSaveError(null);
  }

  async function handleSave(plan: PlanType) {
    if (!accessToken) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updatePlanLimits(accessToken, plan, draftToLimits(draft));
      setPlans((prev) => (prev ? prev.map((p) => (p.plan === plan ? updated : p)) : prev));
      setEditingPlan(null);
      setSavedPlan(plan);
      setTimeout(() => setSavedPlan((current) => (current === plan ? null : current)), 2500);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save plan limits.");
    } finally {
      setSaving(false);
    }
  }

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
          Platform-wide plan tiers. Changing a limit here applies immediately to every organization on that plan.
        </p>
      </div>

      {loadError && <p className={errorTextClass}>{loadError}</p>}

      {plans && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans.map((p) => {
            const isEditing = editingPlan === p.plan;
            return (
              <section key={p.plan} className={cardClass}>
                <div className="flex items-center justify-between">
                  <span className={planBadgeClass(p.plan)}>{p.plan}</span>
                  {!isEditing && (
                    <button type="button" onClick={() => startEditing(p)} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                      Edit
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className={labelClass}>Team members (blank = unlimited)</label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={draft.teamMembers}
                        onChange={(e) => setDraft((d) => ({ ...d, teamMembers: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tickets / month (blank = unlimited)</label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={draft.monthlyTickets}
                        onChange={(e) => setDraft((d) => ({ ...d, monthlyTickets: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Feedback forms (blank = unlimited)</label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        value={draft.feedbackForms}
                        onChange={(e) => setDraft((d) => ({ ...d, feedbackForms: e.target.value }))}
                      />
                    </div>
                    {saveError && <p className={errorTextClass}>{saveError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSave(p.plan)}
                        className={`${buttonClass} w-auto! px-4`}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button type="button" disabled={saving} onClick={cancelEditing} className={`${secondaryButtonClass} w-auto`}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
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
                    {savedPlan === p.plan && <p className={successTextClass}>Saved.</p>}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
