"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { linkClass } from "@/lib/ui";

export default function DashboardPage() {
  const router = useRouter();
  const { user, status } = useAuth();

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

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
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
          {user.role === "TENANT_OWNER" && (
            <p className="text-sm text-gray-500">
              Manage your{" "}
              <Link href="/settings/organization" className={linkClass}>
                organization settings
              </Link>{" "}
              or{" "}
              <Link href="/settings/team" className={linkClass}>
                team members
              </Link>
              .
            </p>
          )}
          <p className="text-xs text-gray-400">
            Tickets, feedback, and analytics arrive in later phases.
          </p>
        </div>
    </main>
  );
}
