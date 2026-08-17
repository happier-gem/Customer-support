"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type FeedbackResponse, type Paginated } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, secondaryButtonClass } from "@/lib/ui";

export default function SupportFeedbackResponsesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [responses, setResponses] = useState<Paginated<FeedbackResponse> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listFeedbackResponses(accessToken, params.id, { page, limit: 10 });
      setResponses(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, params.id, page]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading" || !user || loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-lg font-semibold text-gray-900">Responses ({responses?.pagination.total ?? 0})</h1>

        {error && <p className={errorTextClass}>{error}</p>}

        {!responses || responses.data.length === 0 ? (
          <div className={cardClass}>
            <p className="text-sm text-gray-500">No responses yet.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {responses.data.map((response) => (
              <li key={response.id} className={`${cardClass} space-y-2`}>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {response.anonymous ? (
                      <span className="font-medium text-gray-700">Anonymous</span>
                    ) : (
                      response.customer && `${response.customer.name} (${response.customer.email})`
                    )}
                  </span>
                  <span>{new Date(response.createdAt).toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  {response.answers.map((answer) => (
                    <div key={answer.id} className="text-sm">
                      <p className="font-medium text-gray-700">{answer.questionLabel}</p>
                      {answer.questionType === "RATING" ? (
                        <p className="text-gray-600">{answer.ratingValue !== null ? `${answer.ratingValue} / 5` : "No answer"}</p>
                      ) : (
                        <p className="whitespace-pre-wrap text-gray-600">{answer.textValue || "No answer"}</p>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {responses && responses.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Page {responses.pagination.page} of {responses.pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button className={`${secondaryButtonClass} w-auto`} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <button
                className={`${buttonClass} w-auto px-4`}
                disabled={page >= responses.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        <button onClick={() => router.push("/feedback")} className={`${secondaryButtonClass} w-auto`}>
          Back to feedback
        </button>
      </main>
    </div>
  );
}
