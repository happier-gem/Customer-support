"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardNav } from "@/components/dashboard-nav";
import { api, ApiError, type Invitation, type Member } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  errorTextClass,
  inputClass,
  labelClass,
  selectClass,
  successTextClass,
} from "@/lib/ui";

const ASSIGNABLE_ROLES = ["TENANT_OWNER", "SUPPORT_AGENT"] as const;

const invitationStatusClass: Record<Invitation["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  ACCEPTED: "bg-green-50 text-green-700",
  EXPIRED: "bg-gray-100 text-gray-500",
  REVOKED: "bg-gray-100 text-gray-500",
};

export default function TeamSettingsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>("SUPPORT_AGENT");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && user && user.role !== "TENANT_OWNER") {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setLoadError(null);
    try {
      const [membersList, invitationsList] = await Promise.all([
        api.listMembers(accessToken),
        api.listInvitations(accessToken),
      ]);
      setMembers(membersList);
      setInvitations(invitationsList);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load team.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "TENANT_OWNER") {
      loadData();
    }
  }, [status, user, loadData]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setInviteError(null);
    setInviteSuccess(null);
    setInviting(true);
    try {
      await api.inviteMember(accessToken, { email: inviteEmail, role: inviteRole });
      setInviteSuccess(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail("");
      await loadData();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    if (!accessToken) return;
    setRowError(null);
    setBusyUserId(userId);
    try {
      const updated = await api.updateMemberRole(accessToken, userId, role);
      setMembers((prev) => prev.map((m) => (m.id === userId ? updated : m)));
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to update role.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!accessToken) return;
    setRowError(null);
    setBusyUserId(userId);
    try {
      await api.removeMember(accessToken, userId);
      await loadData();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to remove team member.");
    } finally {
      setBusyUserId(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex flex-1 flex-col bg-gray-50">
        <DashboardNav />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user || user.role !== "TENANT_OWNER") {
    return null;
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING");

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <DashboardNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Team members</h1>

        <form onSubmit={handleInvite} className={`${cardClass} space-y-4`}>
          <h2 className="text-sm font-semibold text-gray-900">Invite a teammate</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="inviteEmail" className={labelClass}>
                Email
              </label>
              <input
                id="inviteEmail"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={inputClass}
                placeholder="teammate@company.com"
              />
            </div>
            <div className="sm:w-48">
              <label htmlFor="inviteRole" className={labelClass}>
                Role
              </label>
              <select
                id="inviteRole"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as (typeof ASSIGNABLE_ROLES)[number])}
                className={selectClass}
              >
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={inviting} className={`${buttonClass} sm:w-40`}>
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
          {inviteError && <p className={errorTextClass}>{inviteError}</p>}
          {inviteSuccess && <p className={successTextClass}>{inviteSuccess}</p>}
        </form>

        {loadError && <p className={errorTextClass}>{loadError}</p>}
        {rowError && <p className={errorTextClass}>{rowError}</p>}

        <section className={`${cardClass} space-y-4`}>
          <h2 className="text-sm font-semibold text-gray-900">Members</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.id === user.id;
                  const busy = busyUserId === member.id;
                  return (
                    <tr key={member.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-gray-900">
                        {member.name}
                        {isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{member.email}</td>
                      <td className="py-2 pr-4">
                        <select
                          value={member.role}
                          disabled={!member.isActive || busy}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          className={`${selectClass} py-1`}
                        >
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                          {!ASSIGNABLE_ROLES.includes(member.role as (typeof ASSIGNABLE_ROLES)[number]) && (
                            <option value={member.role}>{member.role}</option>
                          )}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            member.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {member.isActive ? "Active" : "Removed"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {member.isActive && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRemove(member.id)}
                            className={dangerButtonClass}
                          >
                            {busy ? "…" : "Remove"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {pendingInvitations.length > 0 && (
          <section className={`${cardClass} space-y-4`}>
            <h2 className="text-sm font-semibold text-gray-900">Pending invitations</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-gray-900">{invitation.email}</td>
                      <td className="py-2 pr-4 text-gray-600">{invitation.role}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invitationStatusClass[invitation.status]}`}>
                          {invitation.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{new Date(invitation.expiresAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
