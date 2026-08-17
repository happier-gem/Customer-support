"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cardClass } from "@/lib/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Profile</h1>
      <div className={`${cardClass} space-y-4`}>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium text-gray-900">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900">{user.role.replace(/_/g, " ")}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Email verified</dt>
            <dd className="font-medium text-gray-900">{user.emailVerified ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
