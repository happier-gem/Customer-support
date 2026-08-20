"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type FeedbackFormSummary, type Paginated } from "@/lib/api";
import { cardClass, errorTextClass } from "@/lib/ui";

export default function CustomerFeedbackPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [result, setResult] = useState<Paginated<FeedbackFormSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listFeedbackForms(accessToken, { limit: 50 });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

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
          <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Questionnaires</h1>

        {error && <p className={errorTextClass}>{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !result || result.data.length === 0 ? (
          <div className={cardClass}>
            <p className="text-sm text-gray-500">There are no questionnaires available right now.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {result.data.map((form) => (
              <li key={form.id}>
                <Link href={`/feedback/${form.id}`} className={`${cardClass} block space-y-1 hover:border-gray-300`}>
                  <p className="font-medium text-gray-900">{form.title}</p>
                  {form.description && <p className="text-sm text-gray-600">{form.description}</p>}
                  <p className="text-xs text-gray-400">{form.category}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
  );
}
