"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  ApiError,
  type FeedbackCategory,
  type FeedbackFormDetail,
  type FeedbackQuestion,
  type FeedbackQuestionType,
  type FeedbackResponse,
  type Paginated,
} from "@/lib/api";
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  errorTextClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  selectClass,
  statusBadgeClass,
  successTextClass,
} from "@/lib/ui";

const CATEGORIES: FeedbackCategory[] = ["SUPPORT", "PRODUCT", "SERVICE", "GENERAL", "OTHER"];

function AnswerLine({ answer }: { answer: FeedbackResponse["answers"][number] }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-gray-700">{answer.questionLabel}</p>
      {answer.questionType === "RATING" ? (
        <p className="text-gray-600">{answer.ratingValue !== null ? `${answer.ratingValue} / 5` : "No answer"}</p>
      ) : (
        <p className="whitespace-pre-wrap text-gray-600">{answer.textValue || "No answer"}</p>
      )}
    </div>
  );
}

export default function FeedbackFormBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [form, setForm] = useState<FeedbackFormDetail | null>(null);
  const [responses, setResponses] = useState<Paginated<FeedbackResponse> | null>(null);
  const [responsePage, setResponsePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<FeedbackCategory>("GENERAL");

  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState<FeedbackQuestionType>("RATING");
  const [newQuestionLabel, setNewQuestionLabel] = useState("");
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [newQuestionMaxLength, setNewQuestionMaxLength] = useState("");

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionLabel, setEditQuestionLabel] = useState("");
  const [editQuestionRequired, setEditQuestionRequired] = useState(true);
  const [editQuestionMaxLength, setEditQuestionMaxLength] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getFeedbackForm(accessToken, params.id);
      setForm(detail);
      setTitleDraft(detail.title);
      setDescriptionDraft(detail.description ?? "");
      setCategoryDraft(detail.category);
      const res = await api.listFeedbackResponses(accessToken, params.id, { page: responsePage, limit: 10 });
      setResponses(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, params.id, responsePage]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "loading" && user && user.role !== "TENANT_OWNER") router.replace("/feedback");
  }, [status, user, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: () => Promise<unknown>, successText: string) {
    setActionError(null);
    setActionMessage(null);
    setBusy(true);
    try {
      await action();
      setActionMessage(successText);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDetails() {
    if (!accessToken) return;
    await runAction(
      () => api.updateFeedbackForm(accessToken, params.id, { title: titleDraft, description: descriptionDraft, category: categoryDraft }),
      "Form updated.",
    );
    setEditingDetails(false);
  }

  async function handleAddQuestion() {
    if (!accessToken) return;
    await runAction(
      () =>
        api.createFeedbackQuestion(accessToken, params.id, {
          type: newQuestionType,
          label: newQuestionLabel,
          required: newQuestionRequired,
          maxLength:
            newQuestionType === "TEXT" && newQuestionMaxLength ? Number(newQuestionMaxLength) : undefined,
        }),
      "Question added.",
    );
    setShowAddQuestion(false);
    setNewQuestionLabel("");
    setNewQuestionMaxLength("");
    setNewQuestionRequired(true);
  }

  function startEditQuestion(question: FeedbackQuestion) {
    setEditingQuestionId(question.id);
    setEditQuestionLabel(question.label);
    setEditQuestionRequired(question.required);
    setEditQuestionMaxLength(question.maxLength ? String(question.maxLength) : "");
  }

  async function handleSaveQuestion(question: FeedbackQuestion) {
    if (!accessToken) return;
    await runAction(
      () =>
        api.updateFeedbackQuestion(accessToken, params.id, question.id, {
          label: editQuestionLabel,
          required: editQuestionRequired,
          maxLength: question.type === "TEXT" && editQuestionMaxLength ? Number(editQuestionMaxLength) : undefined,
        }),
      "Question updated.",
    );
    setEditingQuestionId(null);
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!accessToken) return;
    await runAction(() => api.deleteFeedbackQuestion(accessToken, params.id, questionId), "Question deleted.");
  }

  if (status === "loading" || !user || loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (error || !form) {
    return (
      <div className="flex flex-1 flex-col bg-gray-50">
        <DashboardNav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <p className={errorTextClass}>{error ?? "Feedback form not found."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-start justify-between gap-4">
            {editingDetails ? (
              <div className="flex-1 space-y-3">
                <input className={inputClass} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} maxLength={200} />
                <textarea
                  className={inputClass}
                  rows={3}
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  maxLength={2000}
                />
                <select className={selectClass} value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value as FeedbackCategory)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={handleSaveDetails} className={`${buttonClass} w-auto px-4`}>
                    Save
                  </button>
                  <button disabled={busy} onClick={() => setEditingDetails(false)} className={`${secondaryButtonClass} w-auto`}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{form.title}</h1>
                  {form.description && <p className="mt-1 text-sm text-gray-600">{form.description}</p>}
                  <p className="mt-1 text-xs text-gray-500">Category: {form.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={statusBadgeClass(form.status)}>{form.status}</span>
                  <button onClick={() => setEditingDetails(true)} className={`${secondaryButtonClass} w-auto`}>
                    Edit
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            {form.status === "INACTIVE" ? (
              <button
                disabled={busy || form.questions.length === 0}
                title={form.questions.length === 0 ? "Add at least one question before activating" : undefined}
                onClick={() => runAction(() => api.updateFeedbackFormStatus(accessToken!, form.id, "ACTIVE"), "Form activated.")}
                className={`${buttonClass} w-auto px-4`}
              >
                Activate
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => runAction(() => api.updateFeedbackFormStatus(accessToken!, form.id, "INACTIVE"), "Form deactivated.")}
                className={`${secondaryButtonClass} w-auto`}
              >
                Deactivate
              </button>
            )}
            {form.responseCount === 0 && (
              <button
                disabled={busy}
                onClick={async () => {
                  if (!accessToken) return;
                  await api.deleteFeedbackForm(accessToken, form.id).catch((err) =>
                    setActionError(err instanceof ApiError ? err.message : "Something went wrong."),
                  );
                  router.push("/feedback");
                }}
                className={`${dangerButtonClass} w-auto`}
              >
                Delete form
              </button>
            )}
          </div>
          {actionMessage && <p className={successTextClass}>{actionMessage}</p>}
          {actionError && <p className={errorTextClass}>{actionError}</p>}
        </div>

        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Questions</h2>
            {!showAddQuestion && (
              <button onClick={() => setShowAddQuestion(true)} className={`${secondaryButtonClass} w-auto`}>
                Add question
              </button>
            )}
          </div>

          {form.questions.length === 0 && !showAddQuestion && <p className="text-sm text-gray-500">No questions yet.</p>}

          <ul className="space-y-3">
            {form.questions.map((question) => (
              <li key={question.id} className="rounded-md border border-gray-100 p-3">
                {editingQuestionId === question.id ? (
                  <div className="space-y-2">
                    <input className={inputClass} value={editQuestionLabel} onChange={(e) => setEditQuestionLabel(e.target.value)} maxLength={300} />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={editQuestionRequired} onChange={(e) => setEditQuestionRequired(e.target.checked)} />
                      Required
                    </label>
                    {question.type === "TEXT" && (
                      <div>
                        <label className={labelClass}>Max length (optional)</label>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          className={inputClass}
                          value={editQuestionMaxLength}
                          onChange={(e) => setEditQuestionMaxLength(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => handleSaveQuestion(question)} className={`${buttonClass} w-auto px-4`}>
                        Save
                      </button>
                      <button disabled={busy} onClick={() => setEditingQuestionId(null)} className={`${secondaryButtonClass} w-auto`}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{question.label}</p>
                      <p className="text-xs text-gray-500">
                        {question.type} · {question.required ? "Required" : "Optional"}
                        {question.type === "TEXT" && question.maxLength ? ` · max ${question.maxLength} chars` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => startEditQuestion(question)} className={`${secondaryButtonClass} w-auto`}>
                        Edit
                      </button>
                      <button disabled={busy} onClick={() => handleDeleteQuestion(question.id)} className={`${dangerButtonClass} w-auto`}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {showAddQuestion && (
            <div className="space-y-2 rounded-md border border-gray-100 p-3">
              <select className={selectClass} value={newQuestionType} onChange={(e) => setNewQuestionType(e.target.value as FeedbackQuestionType)}>
                <option value="RATING">Rating (1-5)</option>
                <option value="TEXT">Text</option>
              </select>
              <input
                className={inputClass}
                placeholder="Question label"
                value={newQuestionLabel}
                onChange={(e) => setNewQuestionLabel(e.target.value)}
                maxLength={300}
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={newQuestionRequired} onChange={(e) => setNewQuestionRequired(e.target.checked)} />
                Required
              </label>
              {newQuestionType === "TEXT" && (
                <div>
                  <label className={labelClass}>Max length (optional, default 2000)</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    className={inputClass}
                    value={newQuestionMaxLength}
                    onChange={(e) => setNewQuestionMaxLength(e.target.value)}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button disabled={busy || newQuestionLabel.trim().length < 3} onClick={handleAddQuestion} className={`${buttonClass} w-auto px-4`}>
                  Add
                </button>
                <button disabled={busy} onClick={() => setShowAddQuestion(false)} className={`${secondaryButtonClass} w-auto`}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-gray-900">Responses ({responses?.pagination.total ?? 0})</h2>
          {!responses || responses.data.length === 0 ? (
            <p className="text-sm text-gray-500">No responses yet.</p>
          ) : (
            <ul className="space-y-4">
              {responses.data.map((response) => (
                <li key={response.id} className="space-y-2 rounded-md border border-gray-100 p-3">
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
                      <AnswerLine key={answer.id} answer={answer} />
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
                <button
                  className={`${secondaryButtonClass} w-auto`}
                  disabled={responsePage <= 1}
                  onClick={() => setResponsePage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  className={`${buttonClass} w-auto px-4`}
                  disabled={responsePage >= responses.pagination.totalPages}
                  onClick={() => setResponsePage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => router.push("/feedback")} className={`${secondaryButtonClass} w-auto`}>
          Back to feedback forms
        </button>
      </main>
    </div>
  );
}
