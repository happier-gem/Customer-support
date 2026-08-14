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

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <nav className="flex items-center gap-1">
          <Link href="/tickets" className={`${linkBase} ${pathname.startsWith("/tickets") ? linkActive : linkInactive}`}>
            Tickets
          </Link>
          <Link href="/feedback" className={`${linkBase} ${pathname.startsWith("/feedback") ? linkActive : linkInactive}`}>
            Feedback
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {user.name} <span className="text-gray-400">· {user.role.replace(/_/g, " ")}</span>
          </span>
          <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
