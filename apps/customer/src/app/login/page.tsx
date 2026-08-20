"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { PasswordInput } from "@/components/password-input";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass, secondaryButtonClass } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverifiedEmail(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/tickets");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await api.resendOtp(unverifiedEmail);
    } catch {
      // resendOtp never reveals account state either way — proceed to the
      // verification page regardless, same as a fresh registration would.
    } finally {
      setResending(false);
      router.push(`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Welcome back to the customer portal.">
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
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <Link href="/forgot-password" className="mb-1 text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <p className={errorTextClass}>{error}</p>}
        {unverifiedEmail && (
          <div className="space-y-3 rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm text-amber-800">Your email has not been verified yet.</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                className={`${secondaryButtonClass} w-auto! px-3 py-1.5 text-sm`}
              >
                Verify email
              </Link>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className={`${secondaryButtonClass} w-auto! px-3 py-1.5 text-sm`}
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            </div>
          </div>
        )}
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/join" className={linkClass}>
          Create one
        </Link>
      </p>
    </AuthCard>
  );
}
