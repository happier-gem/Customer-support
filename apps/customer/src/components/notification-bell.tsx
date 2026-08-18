"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, type Notification } from "@/lib/api";
import { useTicketSocket } from "@/lib/use-ticket-socket";

const POLL_INTERVAL_MS = 30_000;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** A customer only ever receives ticket-status notifications, so this is the one route this app needs to resolve. */
function notificationHref(n: Notification): string | null {
  if (n.ticketId) return `/tickets/${n.ticketId}`;
  return null;
}

export function NotificationBell() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    if (!accessToken) return;
    try {
      const { count } = await api.getUnreadNotificationCount(accessToken);
      setUnreadCount(count);
    } catch {
      // Transient failure — the badge just stays stale until the next poll.
    }
  }, [accessToken]);

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await api.listNotifications(accessToken, { limit: 10 });
      setNotifications(result.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next) loadNotifications();
      return next;
    });
  }

  // Opportunistic: any ticket activity likely also created a notification for
  // this user, so refresh the badge immediately instead of waiting for the
  // next poll tick. Reuses the existing ticket socket channel rather than a
  // dedicated notification socket.
  useTicketSocket(accessToken, () => {
    refreshUnreadCount();
    if (open) loadNotifications();
  });

  function handleNotificationClick(notification: Notification) {
    if (!accessToken) return;
    if (!notification.read) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      api.markNotificationRead(accessToken, notification.id).catch(() => {});
    }
    setOpen(false);
    const href = notificationHref(notification);
    if (href) router.push(href);
  }

  async function handleMarkAllRead() {
    if (!accessToken || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await api.markAllNotificationsRead(accessToken).catch(() => {});
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <span aria-hidden className="text-base leading-none">
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-900">
              Notifications{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            </span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Loading…</p>
            ) : loadError ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Unable to load notifications.</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`block w-full border-b border-gray-50 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 ${n.read ? "" : "bg-blue-50/60"}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600" />}
                    <div className={n.read ? "flex-1 pl-3.5" : "flex-1"}>
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
                      <p className="mt-1 text-xs text-gray-400">{relativeTime(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
