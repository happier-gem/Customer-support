"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  Ticket,
  UserCheck,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "@/components/notification-bell";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/tickets?assignee=me", label: "Assigned Tickets", icon: UserCheck },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  function isActive(href: string) {
    const [path, query] = href.split("?");
    if (path === "/tickets") {
      const isTicketsPath = pathname === "/tickets" || /^\/tickets\/[^/]+$/.test(pathname);
      const assignedToMe = searchParams.get("assignee") === "me";
      return isTicketsPath && (query ? assignedToMe : !assignedToMe);
    }
    return pathname === path;
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const body = (
    <>
      <div className={`flex items-center gap-2 border-b border-gray-200 px-4 py-4 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-900 text-sm font-semibold text-white">
          S
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold text-gray-900">Support Desk</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-2">
        <div className={`mb-1 flex items-center gap-2 px-2 py-2 ${collapsed ? "justify-center" : ""}`}>
          <NotificationBell />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-gray-600">{user.name}</span>
              <span className="block truncate text-xs text-gray-400">{user.role.replace(/_/g, " ")}</span>
            </span>
          )}
        </div>
        <Link
          href="/settings/profile"
          onClick={() => setMobileOpen(false)}
          title={collapsed ? "Profile" : undefined}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive("/settings/profile") ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
          } ${collapsed ? "justify-center" : ""}`}
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Profile</span>}
        </Link>
        <Link
          href="/settings/security"
          onClick={() => setMobileOpen(false)}
          title={collapsed ? "Security" : undefined}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive("/settings/security") ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
          } ${collapsed ? "justify-center" : ""}`}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Security</span>}
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-1 hidden w-full items-center justify-center rounded-md px-3 py-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <span className="text-sm font-semibold text-gray-900">Support Desk</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col bg-white shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}

      <aside
        className={`hidden shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-150 md:sticky md:top-0 md:flex md:h-screen md:self-start ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {body}
      </aside>
    </>
  );
}
