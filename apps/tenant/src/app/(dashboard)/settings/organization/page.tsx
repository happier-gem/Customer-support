"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, API_BASE, type Organization } from "@/lib/api";
import {
  buttonClass,
  cardClass,
  errorTextClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  selectClass,
  successTextClass,
} from "@/lib/ui";

const FALLBACK_TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo"];

function listTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();

  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [timezones] = useState<string[]>(() => listTimezones());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && user && user.role !== "TENANT_OWNER") {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken || user?.role !== "TENANT_OWNER") return;
    let cancelled = false;
    api
      .getOrganization(accessToken)
      .then((data) => {
        if (cancelled) return;
        setOrg(data);
        setName(data.name);
        setTimezone(data.timezone);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load organization.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, accessToken, user]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const updated = await api.updateOrganization(accessToken, { name, timezone });
      setOrg(updated);
      setSuccess("Organization settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;

    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      const updated = await api.uploadLogo(accessToken, file);
      setOrg(updated);
      setSuccess("Logo updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload logo.");
    } finally {
      setUploading(false);
    }
  }

  if (status === "loading" || loading) {
    return (
              <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
    );
  }

  if (!user || user.role !== "TENANT_OWNER" || !org) {
    return null;
  }

  return (
          <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-xl font-semibold text-gray-900">Organization settings</h1>

        <section className={`${cardClass} space-y-4`}>
          <h2 className="text-sm font-semibold text-gray-900">Logo</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
              {org.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_BASE}${org.logoUrl}`} alt="Organization logo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-gray-400">No logo</span>
              )}
            </div>
            <label className={`${secondaryButtonClass} cursor-pointer`}>
              {uploading ? "Uploading…" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-gray-400">PNG, JPEG, or WebP. Max 2MB.</p>
        </section>

        <form onSubmit={handleSave} className={`${cardClass} space-y-4`}>
          <h2 className="text-sm font-semibold text-gray-900">Company details</h2>
          <div>
            <label htmlFor="name" className={labelClass}>
              Company name
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
            <label htmlFor="timezone" className={labelClass}>
              Timezone
            </label>
            <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={selectClass}>
              {!timezones.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
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
