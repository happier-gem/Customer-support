"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { OtpInput } from "@/components/otp-input";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, linkClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  // Set by the register page when the backend reported the verification
  // email did NOT actually send (see api.register's emailSent field) — the
  // account still exists, but this page must not claim a code is waiting in
  // an inbox that never received one.
  const initialSendFailed = searchParams.get("emailSent") === "0";

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // No cooldown when the initial send already failed — there's no recent
  // successful send to protect against being spammed, and making someone
  // wait 60s to recover from a failure that wasn't their fault is just bad UX.
  const [cooldown, setCooldown] = useState(email && !initialSendFailed ? RESEND_COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  async function handleVerify() {
    if (!email || otp.length !== 6) return;
    setError(null);
    setVerifying(true);
    try {
      await api.verifyEmail(email, otp);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!email || cooldown > 0) return;
    setResendMessage(null);
    setError(null);
    setResending(true);
    try {
      const res = await api.resendOtp(email);
      setOtp("");
      setCooldown(res.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      setResendMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <AuthCard title="Missing email" subtitle="We couldn't tell which account to verify.">
        <p className={errorTextClass}>This verification link is missing an email address.</p>
        <Link href="/register" className={`${linkClass} block text-center text-sm`}>
          Back to registration
        </Link>
      </AuthCard>
    );
  }

  if (success) {
    return (
      <AuthCard title="Email verified" subtitle="Your account is ready to use.">
        <p className={successTextClass}>Your email has been verified successfully.</p>
        <Link href="/login" className={`${linkClass} block text-center text-sm`}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Verify your email"
      subtitle={
        initialSendFailed
          ? `We couldn't send a verification code to ${email}.`
          : `Enter the 6-digit code we sent to ${email}.`
      }
    >
      <div className="space-y-4">
        {initialSendFailed && !resendMessage && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Your account was created, but the verification email failed to send. Click &quot;Resend code&quot;
            below to try again.
          </p>
        )}

        <OtpInput value={otp} onChange={setOtp} disabled={verifying} />

        {error && <p className={errorTextClass}>{error}</p>}
        {resendMessage && !error && <p className={successTextClass}>{resendMessage}</p>}

        <button type="button" disabled={verifying || otp.length !== 6} onClick={handleVerify} className={buttonClass}>
          {verifying ? "Verifying…" : "Verify"}
        </button>

        <button
          type="button"
          disabled={resending || cooldown > 0}
          onClick={handleResend}
          className={secondaryButtonClass + " w-full"}
        >
          {resending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Wrong email?{" "}
          <Link href="/register" className={linkClass}>
            Start over
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
