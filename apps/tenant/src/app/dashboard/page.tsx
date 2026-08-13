"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { buttonClass } from "@/lib/ui";

export default function DashboardPage() {
  const router = useRouter();
  const { user, status, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (status === "unauthenticated" || !user) {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Welcome, {user.name}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <dl className="space-y-1 text-sm text-gray-700">
          <div className="flex justify-between">
            <dt className="text-gray-500">Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Organization ID</dt>
            <dd className="truncate font-mono text-xs">{user.organizationId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Email verified</dt>
            <dd>{user.emailVerified ? "Yes" : "No"}</dd>
          </div>
        </dl>
        <p className="text-xs text-gray-400">
          This is a Phase 1 placeholder. Tickets, feedback, team management, and analytics arrive in later phases.
        </p>
        <button onClick={handleLogout} className={buttonClass}>
          Sign out
        </button>
      </div>
    </main>
  );
}
