"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, API_BASE } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, inputClass, labelClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { user, accessToken, status, refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.updateProfile(accessToken, { name });
      await refreshUser();
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;

    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      await api.uploadAvatar(accessToken, file);
      await refreshUser();
      setSuccess("Profile picture updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload profile picture.");
    } finally {
      setUploading(false);
    }
  }

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <h1 className="text-xl font-semibold text-foreground">Profile</h1>

      <section className={`${cardClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-foreground">Profile picture</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_BASE}${user.avatarUrl}`} alt="Profile picture" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">{user.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <label className={`${secondaryButtonClass} cursor-pointer`}>
            {uploading ? "Uploading…" : "Upload picture"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP. Max 2MB.</p>
      </section>

      <form onSubmit={handleSave} className={`${cardClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-foreground">Personal details</h2>
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            minLength={2}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <div className="flex items-center gap-2">
            <input type="email" value={user.email} disabled className={`${inputClass} bg-muted text-muted-foreground`} />
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user.emailVerified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
              }`}
            >
              {user.emailVerified ? "Verified" : "Unverified"}
            </span>
          </div>
        </div>
        {error && <p className={errorTextClass}>{error}</p>}
        {success && <p className={successTextClass}>{success}</p>}
        <button type="submit" disabled={saving} className={buttonClass}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
