"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, API_BASE, NEXT_STATUSES, type Member, type TicketDetail, type TicketStatus } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  errorTextClass,
  formatStatusLabel,
  inputClass,
  labelClass,
  priorityBadgeClass,
  secondaryButtonClass,
  selectClass,
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

export default function TenantTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [nextStatus, setNextStatus] = useState<TicketStatus | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyBody, setReplyBody] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTicket(accessToken, params.id);
      setTicket(res);
      if (user?.role === "TENANT_OWNER") {
        const memberList = await api.listMembers(accessToken);
        setMembers(memberList.filter((m) => m.role === "SUPPORT_AGENT" && m.isActive));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, params.id, user?.role]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    await runAction(() => api.uploadTicketAttachment(accessToken, params.id, file), "Attachment uploaded.");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !replyBody.trim()) return;
    const body = replyBody.trim();
    await runAction(() => api.createTicketMessage(accessToken, params.id, body), "Reply sent.");
    setReplyBody("");
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
      <main className="flex flex-1 items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
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

  const canAssign = user.role === "TENANT_OWNER";
  const canChangeStatus = user.role === "TENANT_OWNER" || user.role === "SUPPORT_AGENT";
  const availableNextStatuses = NEXT_STATUSES[ticket.status];

  return (
          <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-lg font-semibold text-foreground">{ticket.title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
              <span className={statusBadgeClass(ticket.status)}>{formatStatusLabel(ticket.status)}</span>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{ticket.description}</p>
          <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <div>
              <dt className="font-medium text-muted-foreground">Customer</dt>
              <dd>
                {ticket.customer.name} ({ticket.customer.email})
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Assigned agent</dt>
              <dd>{ticket.assignedAgent ? ticket.assignedAgent.name : "Unassigned"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Opened</dt>
              <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Last updated</dt>
              <dd>{new Date(ticket.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        {(canAssign || canChangeStatus) && (
          <div className={`${cardClass} space-y-3`}>
            <h2 className="text-sm font-semibold text-foreground">Actions</h2>
            <div className="flex flex-wrap items-center gap-3">
              {canAssign && (
                <div className="flex items-center gap-2">
                  <select className={`${selectClass} w-auto`} value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)}>
                    <option value="">Assign to agent…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !selectedAgentId}
                    onClick={() => runAction(() => api.assignTicket(accessToken!, ticket.id, selectedAgentId), "Ticket assigned.")}
                    className={`${secondaryButtonClass} w-auto`}
                  >
                    Assign
                  </button>
                </div>
              )}

              {canChangeStatus && availableNextStatuses.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className={`${selectClass} w-auto`}
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as TicketStatus | "")}
                  >
                    <option value="">Change status…</option>
                    {availableNextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {formatStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !nextStatus}
                    onClick={() => runAction(() => api.updateStatus(accessToken!, ticket.id, nextStatus as TicketStatus), "Status updated.")}
                    className={`${secondaryButtonClass} w-auto`}
                  >
                    Update
                  </button>
                </div>
              )}
            </div>
            {actionMessage && <p className={successTextClass}>{actionMessage}</p>}
            {actionError && <p className={errorTextClass}>{actionError}</p>}
          </div>
        )}

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
          {ticket.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attachments yet.</p>
          ) : (
            <ul className="space-y-2">
              {ticket.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <button onClick={() => handleDownload(a.id, a.fileName)} className="truncate text-left text-foreground underline underline-offset-2 hover:text-foreground">
                    {a.fileName}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label htmlFor="attachment" className={labelClass}>
              Add attachment (PNG, JPEG, WebP, PDF, TXT, CSV — max 10MB)
            </label>
            <input id="attachment" ref={fileInputRef} type="file" disabled={busy} onChange={handleUpload} className={inputClass} />
          </div>
        </div>

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-foreground">Conversation</h2>
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            <ul className="space-y-3">
              {ticket.messages.map((m) => {
                const isMine = m.author.id === user.id;
                return (
                  <li key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${isMine ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                      {!isMine && <p className="text-xs font-medium text-muted-foreground">{m.author.name}</p>}
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                      <p className={`mt-1 text-xs ${isMine ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleSendReply} className="space-y-2">
            <textarea
              rows={3}
              maxLength={5000}
              disabled={busy}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write a reply…"
              className={inputClass}
            />
            <button type="submit" disabled={busy || !replyBody.trim()} className={`${buttonClass} w-auto! px-4`}>
              {busy ? "Sending…" : "Send reply"}
            </button>
          </form>
        </div>

        <div className={`${cardClass} space-y-3`}>
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <ul className="space-y-2">
            {ticket.history.map((entry) => (
              <li key={entry.id} className="text-sm text-muted-foreground">
                <span>{historyLine(entry)}</span> <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
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
