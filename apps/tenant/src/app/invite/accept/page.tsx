"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { PasswordInput } from "@/components/password-input";
import { api, ApiError, type InvitationPreview } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass, successTextClass } from "@/lib/ui";

type ViewState = "loading" | "invalid" | "form" | "accepted";

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<ViewState>("loading");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("This invitation link is missing its token.");
      setState("invalid");
      return;
    }

    let cancelled = false;
    api
      .validateInvitation(token)
      .then((preview) => {
        if (cancelled) return;
        setInvitation(preview);
        setState("form");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "This invitation link is invalid or has expired.");
        setState("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.acceptInvitation(token, { name, password });
      setState("accepted");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") {
    return (
      <AuthCard title="Loading invitation" subtitle="This will just take a moment.">
        <p className="text-center text-sm text-gray-500">Checking your invitation…</p>
      </AuthCard>
    );
  }

  if (state === "invalid") {
    return (
      <AuthCard title="Invitation not available" subtitle="This link may be invalid, expired, or already used.">
        <p className={errorTextClass}>{loadError}</p>
        <Link href="/login" className={`${linkClass} block text-center text-sm`}>
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  if (state === "accepted") {
    return (
      <AuthCard title="You're in!" subtitle="Your account has been created.">
        <p className={successTextClass}>You&apos;ve joined {invitation?.organizationName}. You can now sign in.</p>
        <Link href="/login" className={`${linkClass} block text-center text-sm`}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${invitation?.organizationName}`}
      subtitle={`You've been invited as ${invitation?.role}. Set a password to accept.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={invitation?.email ?? ""} disabled className={`${inputClass} bg-gray-50 text-gray-500`} />
        </div>
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
        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm password
          </label>
          <PasswordInput
            id="confirmPassword"
            required
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
          />
        </div>
        {submitError && <p className={errorTextClass}>{submitError}</p>}
        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? "Joining…" : "Accept invitation"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
