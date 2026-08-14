"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { api, ApiError } from "@/lib/api";
import { errorTextClass, linkClass, successTextClass } from "@/lib/ui";

type VerifyState = "verifying" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }

    let cancelled = false;
    api
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setState("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "verifying") {
    return (
      <AuthCard title="Verifying your email" subtitle="This will just take a moment.">
        <p className="text-center text-sm text-gray-500">Verifying…</p>
      </AuthCard>
    );
  }

  if (state === "success") {
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
    <AuthCard title="Verification failed" subtitle="This link may be invalid or expired.">
      <p className={errorTextClass}>{message}</p>
      <Link href="/register" className={`${linkClass} block text-center text-sm`}>
        Back to registration
      </Link>
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
