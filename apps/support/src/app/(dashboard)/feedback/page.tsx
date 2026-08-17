"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type FeedbackFormSummary, type Paginated } from "@/lib/api";
import { cardClass, errorTextClass, statusBadgeClass } from "@/lib/ui";

export default function SupportFeedbackPage() {
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
          <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Feedback (read-only)</h1>

        {error && <p className={errorTextClass}>{error}</p>}

        <div className={cardClass}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !result || result.data.length === 0 ? (
            <p className="text-sm text-gray-500">No feedback forms yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Responses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.data.map((form) => (
                  <tr key={form.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/feedback/${form.id}`)}>
                    <td className="max-w-[260px] truncate py-2 font-medium text-gray-900">
                      <Link href={`/feedback/${form.id}`}>{form.title}</Link>
                    </td>
                    <td className="py-2 text-gray-600">{form.category}</td>
                    <td className="py-2">
                      <span className={statusBadgeClass(form.status)}>{form.status}</span>
                    </td>
                    <td className="py-2 text-gray-600">{form.responseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
  );
}
