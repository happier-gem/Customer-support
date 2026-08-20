"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Ticket,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { API_BASE } from "@/lib/api";
import { getInitials } from "@/lib/ui";
import { NotificationBell } from "@/components/notification-bell";
import { AccountMenu } from "@/components/account-menu";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// "Create Ticket" was previously its own top-level nav item pointing at
// /tickets/new — a duplicate entry point, since the Tickets list page (My
// Tickets) already has its own "New Ticket" button leading to the same
// route. One ticket-creation workflow, reached from one place: Tickets.
const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tickets", label: "My Tickets", icon: Ticket },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

function OrgBrand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-semibold text-white shadow-sm">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${API_BASE}${logoUrl}`} alt="" className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const orgName = organization?.name ?? "Customer Portal";

  function isActive(href: string) {
    if (href === "/tickets") return pathname === "/tickets" || /^\/tickets\/[^/]+$/.test(pathname);
    return pathname === href;
  }

  const body = (
    <>
      <div className={`flex items-center gap-2 border-b border-border px-4 py-4 ${collapsed ? "justify-center" : ""}`}>
        <OrgBrand name={orgName} logoUrl={organization?.logoUrl ?? null} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground" title={orgName}>
              {orgName}
            </p>
            <p className="truncate text-xs text-muted-foreground">Customer Portal</p>
          </div>
        )}
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
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <AccountMenu user={user} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-1 hidden w-full items-center justify-center rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <span className="truncate text-sm font-semibold text-foreground" title={orgName}>
          {orgName}
        </span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col bg-card shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}

      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-150 md:sticky md:top-0 md:flex md:h-screen md:self-start ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {body}
      </aside>
    </>
  );
}
