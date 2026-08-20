"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Menu,
  QrCode,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "@/components/notification-bell";
import { AccountMenu } from "@/components/account-menu";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const BASE_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tickets", label: "Tickets", icon: Ticket },
];

const OWNER_ITEMS: NavItem[] = [
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/customer-access", label: "Customer Access", icon: QrCode },
  { href: "/feedback", label: "Questionnaires", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings/subscription", label: "Subscription", icon: CreditCard },
  { href: "/settings/organization", label: "Organization Settings", icon: Building2 },
];

const NOTIFICATIONS_ITEM: NavItem = { href: "/notifications", label: "Notifications", icon: Bell };

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const items = user.role === "TENANT_OWNER" ? [...BASE_ITEMS, ...OWNER_ITEMS, NOTIFICATIONS_ITEM] : [...BASE_ITEMS, NOTIFICATIONS_ITEM];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const body = (
    <>
      <div className={`flex items-center gap-2 border-b border-gray-200 px-4 py-4 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-semibold text-white shadow-sm">
          T
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold text-gray-900">Tenant Portal</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-2">
        <AccountMenu user={user} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
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
        <span className="text-sm font-semibold text-gray-900">Tenant Portal</span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
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
