"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Deliberately doesn't branch on the (intentionally generic, anti-
      // enumeration) response message — every submission moves on to the
      // code-entry screen the same way, whether or not the account exists.
      await api.forgotPassword(email);
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a code to reset it.">
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
        {error && <p className={errorTextClass}>{error}</p>}
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Sending…" : "Send reset code"}
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
