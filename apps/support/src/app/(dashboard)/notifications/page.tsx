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

// Feedback is tenant-owner-only, so a support agent never receives a
// FEEDBACK_SUBMITTED notification in the first place — no feedback route here.
function notificationHref(n: Notification): string | null {
  if (n.ticketId) return `/tickets/${n.ticketId}`;
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
        <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
        {hasUnread && (
          <button type="button" onClick={handleMarkAllRead} className={secondaryButtonClass}>
            Mark all read
          </button>
        )}
      </div>

      {error && <p className={errorTextClass}>{error}</p>}

      <div className={`${cardClass} divide-y divide-gray-100 p-0`}>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-blue-50/60"}`}>
              <button type="button" onClick={() => handleClick(n)} className="flex-1 text-left">
                <div className="flex items-start gap-2">
                  {!n.read && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />}
                  <div className={n.read ? "flex-1 pl-3.5" : "flex-1"}>
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">{relativeTime(n.createdAt)}</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(n.id)}
                aria-label="Delete notification"
                className="shrink-0 rounded-md p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
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
