"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/password-input";
import { buttonClass, cardClass, errorTextClass, labelClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { user, accessToken, status, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(accessToken, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password changed. You'll stay signed in on this device, but other sessions have been signed out.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Security</h1>

      <form onSubmit={handleChangePassword} className={`${cardClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
        <div>
          <label htmlFor="currentPassword" className={labelClass}>
            Current password
          </label>
          <PasswordInput
            id="currentPassword"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="newPassword" className={labelClass}>
            New password
          </label>
          <PasswordInput
            id="newPassword"
            required
            minLength={8}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters, with a letter and a number"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm new password
          </label>
          <PasswordInput
            id="confirmPassword"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && <p className={errorTextClass}>{error}</p>}
        {success && <p className={successTextClass}>{success}</p>}
        <button type="submit" disabled={saving} className={buttonClass}>
          {saving ? "Changing…" : "Change password"}
        </button>
      </form>

      <section className={`${cardClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-gray-900">Session</h2>
        <p className="text-sm text-gray-500">Sign out of your account on this device.</p>
        <button type="button" onClick={handleLogout} className={secondaryButtonClass}>
          Log out
        </button>
      </section>
    </main>
  );
}
