"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type TicketPriority } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, inputClass, labelClass, selectClass } from "@/lib/ui";

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function NewTicketPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const ticket = await api.createTicket(accessToken, { title, description, priority });
      router.push(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">New Ticket</h1>
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
              placeholder="Briefly describe the issue"
            />
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder="Give as much detail as you can"
            />
          </div>
          <div>
            <label htmlFor="priority" className={labelClass}>
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className={selectClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {error && <p className={errorTextClass}>{error}</p>}
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
      </main>
    </div>
  );
}
