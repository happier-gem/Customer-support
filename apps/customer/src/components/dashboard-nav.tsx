"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const linkBase = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
const linkActive = "bg-gray-900 text-white";
const linkInactive = "text-gray-600 hover:bg-gray-100";

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) return null;

  const links = [
    { href: "/tickets", label: "My Tickets" },
    { href: "/tickets/new", label: "New Ticket" },
  ];

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${linkBase} ${pathname === link.href ? linkActive : linkInactive}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user.name}</span>
          <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
