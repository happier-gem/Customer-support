"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, API_BASE, type TicketDetail } from "@/lib/api";
import { useTicketSocket } from "@/lib/use-ticket-socket";
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
  successTextClass,
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
    case "MESSAGE_ADDED":
      return `${entry.actor.name} replied`;
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
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

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

  const { connected } = useTicketSocket(accessToken, (_event, payload) => {
    const eventTicketId = payload.ticket?.id ?? payload.ticketId;
    if (eventTicketId === params.id) load();
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    setUploadError(null);
    setUploadSuccess(false);
    setUploading(true);
    try {
      await api.uploadAttachment(accessToken, params.id, file);
      setUploadSuccess(true);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !replyBody.trim()) return;
    setReplyError(null);
    setSendingReply(true);
    try {
      await api.createTicketMessage(accessToken, params.id, replyBody.trim());
      setReplyBody("");
      await load();
    } catch (err) {
      setReplyError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSendingReply(false);
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
              <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          <p className={errorTextClass}>{error ?? "Ticket not found."}</p>
        </main>
    );
  }

  return (
          <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{ticket.title}</h1>
              <span
                className="flex items-center gap-1 text-xs text-gray-400"
                title={connected ? "Live updates connected" : "Live updates unavailable"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`} />
                {connected ? "Live" : "Offline"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
              <span className={statusBadgeClass(ticket.status)}>{formatStatusLabel(ticket.status)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">Ticket #{ticket.id.slice(0, 8)}</p>
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
            <div>
              <dt className="font-medium text-gray-600">Last updated</dt>
              <dd>{new Date(ticket.updatedAt).toLocaleString()}</dd>
            </div>
            {ticket.resolvedAt && (
              <div>
                <dt className="font-medium text-gray-600">Resolved</dt>
                <dd>{new Date(ticket.resolvedAt).toLocaleString()}</dd>
              </div>
            )}
            {ticket.closedAt && (
              <div>
                <dt className="font-medium text-gray-600">Closed</dt>
                <dd>{new Date(ticket.closedAt).toLocaleString()}</dd>
              </div>
            )}
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
            {uploadSuccess && !uploadError && <p className={`${successTextClass} mt-2`}>Attachment uploaded.</p>}
          </div>
        </div>

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-gray-500">No replies yet.</p>
          ) : (
            <ul className="space-y-3">
              {ticket.messages.map((m) => {
                const isMine = m.author.id === user.id;
                return (
                  <li key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${isMine ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                      {!isMine && <p className="text-xs font-medium text-gray-500">{m.author.name}</p>}
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                      <p className={`mt-1 text-xs ${isMine ? "text-gray-300" : "text-gray-400"}`}>
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {ticket.status === "CLOSED" ? (
            <p className="text-sm text-gray-500">This ticket is closed and can no longer receive replies.</p>
          ) : (
            <form onSubmit={handleSendReply} className="space-y-2">
              <textarea
                rows={3}
                maxLength={5000}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply…"
                className={inputClass}
              />
              {replyError && <p className={errorTextClass}>{replyError}</p>}
              <button type="submit" disabled={sendingReply || !replyBody.trim()} className={`${buttonClass} w-auto! px-4`}>
                {sendingReply ? "Sending…" : "Send reply"}
              </button>
            </form>
          )}
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
  );
}
