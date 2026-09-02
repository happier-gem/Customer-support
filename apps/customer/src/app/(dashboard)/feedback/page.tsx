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
      <main className="flex flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
          <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Feedback</h1>
          <p className="text-sm text-muted-foreground">Help us improve your experience.</p>
        </div>

        {error && <p className={errorTextClass}>{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !result || result.data.length === 0 ? (
          <div className={cardClass}>
            <p className="text-sm text-muted-foreground">There are no feedback forms available right now.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {result.data.map((form) => (
              <li key={form.id}>
                <Link
                  href={`/feedback/${form.id}`}
                  className={`${cardClass} flex items-center justify-between gap-4 hover:border-ring/40`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{form.title}</p>
                    {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
                    <p className="text-xs text-muted-foreground">{form.category}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                    Give feedback
                    <span aria-hidden="true">&rarr;</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
  );
}
