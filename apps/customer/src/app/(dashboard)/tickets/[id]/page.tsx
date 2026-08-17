"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, API_BASE, type TicketDetail } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  errorTextClass,
  formatStatusLabel,
  inputClass,
  labelClass,
  priorityBadgeClass,
  secondaryButtonClass,
  statusBadgeClass,
} from "@/lib/ui";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function historyLine(entry: TicketDetail["history"][number]): string {
  switch (entry.action) {
    case "CREATED":
      return `${entry.actor.name} created this ticket`;
    case "ASSIGNED":
      return `${entry.actor.name} assigned this ticket to ${(entry.metadata?.agentName as string) ?? "an agent"}`;
    case "STATUS_CHANGED":
      return `${entry.actor.name} changed status from ${formatStatusLabel(entry.previousStatus ?? "")} to ${formatStatusLabel(entry.newStatus ?? "")}`;
    case "UPDATED":
      return `${entry.actor.name} updated ${((entry.metadata?.fields as string[]) ?? []).join(", ") || "the ticket"}`;
    case "ATTACHMENT_ADDED":
      return `${entry.actor.name} attached ${(entry.metadata?.fileName as string) ?? "a file"}`;
    default:
      return `${entry.actor.name} performed ${entry.action}`;
  }
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTicket(accessToken, params.id);
      setTicket(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    setUploadError(null);
    setUploading(true);
    try {
      await api.uploadAttachment(accessToken, params.id, file);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(attachmentId: string, fileName: string) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/tickets/${params.id}/attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === "loading" || !user || loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-1 flex-col bg-gray-50">
        <DashboardNav />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          <p className={errorTextClass}>{error ?? "Ticket not found."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-lg font-semibold text-gray-900">{ticket.title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
              <span className={statusBadgeClass(ticket.status)}>{formatStatusLabel(ticket.status)}</span>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{ticket.description}</p>
          <dl className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
            <div>
              <dt className="font-medium text-gray-600">Assigned agent</dt>
              <dd>{ticket.assignedAgent ? ticket.assignedAgent.name : "Unassigned"}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-600">Opened</dt>
              <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-gray-900">Attachments</h2>
          {ticket.attachments.length === 0 ? (
            <p className="text-sm text-gray-500">No attachments yet.</p>
          ) : (
            <ul className="space-y-2">
              {ticket.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <button onClick={() => handleDownload(a.id, a.fileName)} className="truncate text-left text-gray-900 underline underline-offset-2 hover:text-gray-700">
                    {a.fileName}
                  </button>
                  <span className="shrink-0 text-xs text-gray-400">{formatBytes(a.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label htmlFor="attachment" className={labelClass}>
              Add attachment (PNG, JPEG, WebP, PDF, TXT, CSV — max 10MB)
            </label>
            <input
              id="attachment"
              ref={fileInputRef}
              type="file"
              disabled={uploading}
              onChange={handleUpload}
              className={inputClass}
            />
            {uploadError && <p className={`${errorTextClass} mt-2`}>{uploadError}</p>}
          </div>
        </div>

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-gray-900">History</h2>
          <ul className="space-y-2">
            {ticket.history.map((entry) => (
              <li key={entry.id} className="text-sm text-gray-600">
                <span>{historyLine(entry)}</span>{" "}
                <span className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>

        <button onClick={() => router.push("/tickets")} className={`${secondaryButtonClass} w-auto`}>
          Back to tickets
        </button>
      </main>
    </div>
  );
}
