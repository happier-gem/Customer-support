"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type FeedbackAnswerInput, type FeedbackFormDetail } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, inputClass, labelClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

const RATING_VALUES = [1, 2, 3, 4, 5];

export default function CustomerFeedbackFormPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [form, setForm] = useState<FeedbackFormDetail | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getFeedbackForm(accessToken, params.id);
      setForm(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "This feedback form isn't available.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, params.id]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (!accessToken || !form) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const answers: FeedbackAnswerInput[] = [];
      for (const question of form.questions) {
        if (question.type === "RATING") {
          const value = ratings[question.id];
          if (value !== undefined) answers.push({ questionId: question.id, ratingValue: value });
        } else {
          const value = texts[question.id]?.trim();
          if (value) answers.push({ questionId: question.id, textValue: value });
        }
      }
      await api.submitFeedbackResponse(accessToken, form.id, { anonymous, answers });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || !user || loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (error || !form) {
    return (
              <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          <p className={errorTextClass}>{error ?? "This feedback form isn't available."}</p>
          <button onClick={() => router.push("/feedback")} className={`${secondaryButtonClass} mt-4 w-auto`}>
            Back to feedback
          </button>
        </main>
    );
  }

  if (submitted) {
    return (
              <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          <div className={`${cardClass} space-y-3 text-center`}>
            <p className={successTextClass}>Thank you — your feedback has been submitted.</p>
            <button onClick={() => router.push("/feedback")} className={`${buttonClass} w-auto! px-4`}>
              Back to feedback
            </button>
          </div>
        </main>
    );
  }

  return (
          <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{form.title}</h1>
          {form.description && <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>}
        </div>

        <div className={`${cardClass} space-y-6`}>
          {form.questions.map((question) => (
            <div key={question.id}>
              <label className={labelClass}>
                {question.label}
                {question.required && <span className="text-danger"> *</span>}
              </label>
              {question.type === "RATING" ? (
                <div className="flex gap-2">
                  {RATING_VALUES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRatings((prev) => ({ ...prev, [question.id]: value }))}
                      className={`h-10 w-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        ratings[question.id] === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  className={inputClass}
                  rows={4}
                  maxLength={question.maxLength ?? 2000}
                  value={texts[question.id] ?? ""}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder="Your answer"
                />
              )}
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            Submit anonymously (your name and email won&apos;t be shown to the organization)
          </label>

          {submitError && <p className={errorTextClass}>{submitError}</p>}
          <button disabled={submitting} onClick={handleSubmit} className={buttonClass}>
            {submitting ? "Submitting…" : "Submit feedback"}
          </button>
        </div>
      </main>
  );
}
