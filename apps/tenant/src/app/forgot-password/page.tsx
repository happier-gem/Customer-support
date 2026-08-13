"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass, successTextClass } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a link to reset it.">
      {message ? (
        <p className={successTextClass}>{message}</p>
      ) : (
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
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="text-center text-sm text-gray-500">
        <Link href="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
