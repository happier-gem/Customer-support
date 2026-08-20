"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type FeedbackCategory } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, inputClass, labelClass, linkClass, selectClass } from "@/lib/ui";

const CATEGORIES: FeedbackCategory[] = ["SUPPORT", "PRODUCT", "SERVICE", "GENERAL", "OTHER"];

export default function NewFeedbackFormPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("GENERAL");
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "loading" && user && user.role !== "TENANT_OWNER") router.replace("/feedback");
  }, [status, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setLimitReached(false);
    setLoading(true);
    try {
      const form = await api.createFeedbackForm(accessToken, { title, description: description || undefined, category });
      router.push(`/feedback/${form.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLimitReached(err instanceof ApiError && err.code === "PLAN_LIMIT_REACHED");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
          <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">New Questionnaire</h1>
        <form onSubmit={handleSubmit} className={`${cardClass} space-y-4`}>
          <div>
            <label htmlFor="title" className={labelClass}>
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Customer Satisfaction Survey"
            />
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder="Tell customers what this questionnaire is for"
            />
          </div>
          <div>
            <label htmlFor="category" className={labelClass}>
              Category
            </label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)} className={selectClass}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className={errorTextClass}>
              {error}
              {limitReached && (
                <>
                  {" "}
                  <Link href="/settings/subscription" className={linkClass}>
                    View plans
                  </Link>
                </>
              )}
            </p>
          )}
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Creating…" : "Create questionnaire"}
          </button>
          <p className="text-xs text-gray-500">
            The questionnaire starts inactive. Add your questions on the next screen, then activate it when you&apos;re ready for
            customers to respond.
          </p>
        </form>
      </main>
  );
}
