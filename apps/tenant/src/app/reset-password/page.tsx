"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { OtpInput } from "@/components/otp-input";
import { PasswordInput } from "@/components/password-input";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

const RESEND_COOLDOWN_SECONDS = 60;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(emailFromQuery ? RESEND_COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("Enter the email you requested the reset code for.");
      return;
    }
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(email, code, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || cooldown > 0) return;
    setResendMessage(null);
    setError(null);
    setResending(true);
    try {
      await api.forgotPassword(email);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResendMessage("If that account exists, a new code has been sent.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (success) {
    return (
      <AuthCard title="Password reset" subtitle="You can now sign in with your new password.">
        <p className={successTextClass}>Your password has been reset successfully.</p>
        <Link href="/login" className={`${linkClass} block text-center text-sm`}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter the code we emailed you and choose a new password.">
      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className={labelClass}>Reset code</label>
          <OtpInput value={code} onChange={setCode} disabled={loading} />
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
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
          />
        </div>

        {error && <p className={errorTextClass}>{error}</p>}
        {resendMessage && !error && <p className={successTextClass}>{resendMessage}</p>}

        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Resetting…" : "Reset password"}
        </button>

        <button
          type="button"
          disabled={resending || cooldown > 0}
          onClick={handleResend}
          className={secondaryButtonClass + " w-full"}
        >
          {resending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
