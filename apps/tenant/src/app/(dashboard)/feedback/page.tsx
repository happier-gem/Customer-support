"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type FeedbackCategory, type FeedbackFormSummary, type Paginated } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, secondaryButtonClass, selectClass, statusBadgeClass } from "@/lib/ui";

const CATEGORY_OPTIONS: FeedbackCategory[] = ["SUPPORT", "PRODUCT", "SERVICE", "GENERAL", "OTHER"];

export default function FeedbackFormsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [result, setResult] = useState<Paginated<FeedbackFormSummary> | null>(null);
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listFeedbackForms(accessToken, { page, limit: 15, category: category || undefined });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, category]);

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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Feedback Forms</h1>
          <Link href="/feedback/new" className={`${buttonClass} w-auto! px-4`}>
            New form
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className={`${selectClass} w-auto`}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as FeedbackCategory | "");
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {error && <p className={errorTextClass}>{error}</p>}

        <div className={cardClass}>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !result || result.data.length === 0 ? (
            <p className="text-sm text-gray-500">No feedback forms yet. Create one to start collecting responses.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Questions</th>
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
                    <td className="py-2 text-gray-600">{form.questionCount}</td>
                    <td className="py-2 text-gray-600">{form.responseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {result && result.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
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
