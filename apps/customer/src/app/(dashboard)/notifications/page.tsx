"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Notification } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, secondaryButtonClass } from "@/lib/ui";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function notificationHref(n: Notification): string | null {
  if (n.ticketId) return `/tickets/${n.ticketId}`;
  if (n.feedbackFormId) return `/feedback/${n.feedbackFormId}`;
  return null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { accessToken, status } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listNotifications(accessToken, { limit: 50 });
      setNotifications(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClick(n: Notification) {
    if (!accessToken) return;
    if (!n.read) {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      api.markNotificationRead(accessToken, n.id).catch(() => {});
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  async function handleMarkAllRead() {
    if (!accessToken) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.markAllNotificationsRead(accessToken).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!accessToken) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await api.deleteNotification(accessToken, id).catch(() => {});
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
        {hasUnread && (
          <button type="button" onClick={handleMarkAllRead} className={secondaryButtonClass}>
            Mark all read
          </button>
        )}
      </div>

      {error && <p className={errorTextClass}>{error}</p>}

      <div className={`${cardClass} divide-y divide-border p-0`}>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-info/10"}`}>
              <button type="button" onClick={() => handleClick(n)} className="flex-1 text-left">
                <div className="flex items-start gap-2">
                  {!n.read && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-info" />}
                  <div className={n.read ? "flex-1 pl-3.5" : "flex-1"}>
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(n.id)}
                aria-label="Delete notification"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {!loading && notifications.length > 0 && (
        <button type="button" onClick={load} className={buttonClass}>
          Refresh
        </button>
      )}
    </main>
  );
}
