"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, ShieldCheck, UserCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { API_BASE, type PublicUser } from "@/lib/api";

interface AccountMenuProps {
  user: PublicUser;
  collapsed: boolean;
  onNavigate: () => void;
}

/**
 * Every role currently lands on the same two self-service pages
 * (/settings/profile, /settings/security) — there is no role-specific
 * account page to differentiate here, so the menu is intentionally
 * identical across roles rather than inventing a destination that doesn't
 * exist yet.
 */
const MENU_ITEMS = [
  { href: "/settings/profile", label: "Profile", icon: UserCircle },
  { href: "/settings/security", label: "Security", icon: ShieldCheck },
];

export function AccountMenu({ user, collapsed, onNavigate }: AccountMenuProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.push("/login");
  }

  function handleNavigate() {
    setOpen(false);
    onNavigate();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? `${user.name} (${user.role.replace(/_/g, " ")})` : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-100 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-900 text-sm font-semibold text-white">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_BASE}${user.avatarUrl}`} alt="" className="h-full w-full object-cover" />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </div>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{user.name}</span>
              <span className="block truncate text-xs text-gray-500">{user.role.replace(/_/g, " ")}</span>
            </span>
            <ChevronsUpDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      <div
        role="menu"
        aria-label="Account menu"
        className={`absolute bottom-full z-50 mb-2 w-56 origin-bottom rounded-lg border border-gray-200 bg-white py-1 shadow-lg transition-all duration-150 ${
          collapsed ? "left-full ml-2 mb-0 origin-bottom-left" : "left-0 right-0"
        } ${open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"}`}
      >
        <div className="border-b border-gray-100 px-3 py-2">
          <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
        {MENU_ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              ref={i === 0 ? firstItemRef : undefined}
              href={item.href}
              role="menuitem"
              onClick={handleNavigate}
              tabIndex={open ? 0 : -1}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Icon className="h-4 w-4 shrink-0 text-gray-400" />
              {item.label}
            </Link>
          );
        })}
        <div className="my-1 border-t border-gray-100" />
        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          tabIndex={open ? 0 : -1}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4 shrink-0 text-gray-400" />
          Logout
        </button>
      </div>
    </div>
  );
}
