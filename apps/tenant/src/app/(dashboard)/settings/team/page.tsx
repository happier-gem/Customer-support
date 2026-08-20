"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Invitation, type Member } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  errorTextClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  selectClass,
  successTextClass,
} from "@/lib/ui";

const ASSIGNABLE_ROLES = ["TENANT_OWNER", "SUPPORT_AGENT"] as const;

const invitationStatusClass: Record<Invitation["status"], string> = {
  PENDING: "bg-warning/10 text-warning",
  ACCEPTED: "bg-success/10 text-success",
  EXPIRED: "bg-muted text-muted-foreground",
  REVOKED: "bg-muted text-muted-foreground",
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
  const [inviteLimitReached, setInviteLimitReached] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // One-time-reveal invite links, keyed by invitation id. The server only ever
  // returns the raw link at the moment an invitation is created or resent —
  // listInvitations() never includes it, since only the token's hash is stored.
  const [inviteUrls, setInviteUrls] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);

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
    setInviteLimitReached(false);
    setInviteSuccess(null);
    setInviting(true);
    try {
      const created = await api.inviteMember(accessToken, { email: inviteEmail, role: inviteRole });
      setInviteUrls((prev) => ({ ...prev, [created.id]: created.inviteUrl }));
      setInviteSuccess(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail("");
      await loadData();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation.");
      setInviteLimitReached(err instanceof ApiError && err.code === "PLAN_LIMIT_REACHED");
    } finally {
      setInviting(false);
    }
  }

  async function handleCopyLink(id: string) {
    const url = inviteUrls[id];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      // Clipboard access denied/unavailable — nothing to recover from client-side.
    }
  }

  async function handleResend(id: string) {
    if (!accessToken) return;
    setRowError(null);
    setBusyInvitationId(id);
    try {
      const resent = await api.resendInvitation(accessToken, id);
      setInviteUrls((prev) => ({ ...prev, [resent.id]: resent.inviteUrl }));
      await loadData();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to resend invitation.");
    } finally {
      setBusyInvitationId(null);
    }
  }

  async function handleRevoke(id: string) {
    if (!accessToken) return;
    setRowError(null);
    setBusyInvitationId(id);
    try {
      await api.revokeInvitation(accessToken, id);
      await loadData();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to revoke invitation.");
    } finally {
      setBusyInvitationId(null);
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
              <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
    );
  }

  if (!user || user.role !== "TENANT_OWNER") {
    return null;
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING");

  return (
          <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-foreground">Team members</h1>

        <form onSubmit={handleInvite} className={`${cardClass} space-y-4`}>
          <h2 className="text-sm font-semibold text-foreground">Invite a teammate</h2>
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
          {inviteError && (
            <p className={errorTextClass}>
              {inviteError}
              {inviteLimitReached && (
                <>
                  {" "}
                  <Link href="/settings/subscription" className={linkClass}>
                    View plans
                  </Link>
                </>
              )}
            </p>
          )}
          {inviteSuccess && <p className={successTextClass}>{inviteSuccess}</p>}
        </form>

        {loadError && <p className={errorTextClass}>{loadError}</p>}
        {rowError && <p className={errorTextClass}>{rowError}</p>}

        <section className={`${cardClass} space-y-4`}>
          <h2 className="text-sm font-semibold text-foreground">Members</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
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
                    <tr key={member.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 text-foreground">
                        {member.name}
                        {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{member.email}</td>
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
                            member.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
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
            <h2 className="text-sm font-semibold text-foreground">Pending invitations</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Expires</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((invitation) => {
                    const busy = busyInvitationId === invitation.id;
                    const hasLink = Boolean(inviteUrls[invitation.id]);
                    return (
                      <tr key={invitation.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4 text-foreground">{invitation.email}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{invitation.role}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invitationStatusClass[invitation.status]}`}>
                            {invitation.status}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{new Date(invitation.expiresAt).toLocaleDateString()}</td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center justify-end gap-2">
                            {hasLink && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleCopyLink(invitation.id)}
                                className={`${secondaryButtonClass} w-auto px-2 py-1 text-xs`}
                              >
                                {copiedId === invitation.id ? "Copied!" : "Copy link"}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleResend(invitation.id)}
                              className={`${secondaryButtonClass} w-auto px-2 py-1 text-xs`}
                            >
                              {busy ? "…" : "Resend"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRevoke(invitation.id)}
                              className={`${dangerButtonClass} w-auto px-2 py-1 text-xs`}
                            >
                              {busy ? "…" : "Revoke"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
  );
}
