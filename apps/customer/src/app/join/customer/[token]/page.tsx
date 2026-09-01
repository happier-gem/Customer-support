"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { PasswordInput } from "@/components/password-input";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type JoinPreview } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass } from "@/lib/ui";

export default function JoinByTokenPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, status } = useAuth();

  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .resolveJoinToken(params.token)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "This join link is invalid or has been revoked.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await api.registerCustomer({ joinToken: preview.joinToken, name, email, password });
      const params = new URLSearchParams({ email });
      if (!result.emailSent) params.set("emailSent", "0");
      router.push(`/verify-email?${params.toString()}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading || status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (loadError || !preview) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted px-4">
        <AuthCard title="Invalid join link" subtitle="This link is invalid, has expired, or has been revoked.">
          <p className={errorTextClass}>{loadError ?? "This join link is invalid or has been revoked."}</p>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/join" className={linkClass}>
              Try entering a code instead
            </Link>
          </p>
        </AuthCard>
      </main>
    );
  }

  // Already signed in.
  if (status === "authenticated" && user) {
    const sameOrg = user.organizationId && preview.organizationName;
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted px-4">
        <AuthCard title={`Join ${preview.organizationName}`} subtitle="You're already signed in.">
          {sameOrg ? (
            <>
              <p className="text-sm text-muted-foreground">
                You're signed in as <strong>{user.email}</strong>. To join a different organization's support portal, log out and
                register a new account with a different email address — each account belongs to a single organization.
              </p>
              <Link href="/dashboard" className={`${buttonClass} block text-center`}>
                Go to my dashboard
              </Link>
            </>
          ) : null}
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <AuthCard title={`Join ${preview.organizationName}`} subtitle="Create your account to get support from this organization.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelClass}>
              Your name
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
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <PasswordInput
              id="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters, with a letter and a number"
            />
          </div>
          {submitError && <p className={errorTextClass}>{submitError}</p>}
          <button type="submit" disabled={submitting} className={buttonClass}>
            {submitting ? "Creating your account…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className={linkClass}>
            Sign in
          </Link>
        </p>
      </AuthCard>
    </main>
  );
}
