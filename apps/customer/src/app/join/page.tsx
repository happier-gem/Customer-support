"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass } from "@/lib/ui";

export default function JoinByCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const preview = await api.resolveJoinCode(code.trim());
      router.push(`/join/customer/${encodeURIComponent(preview.joinToken)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "This code is invalid or has been revoked.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <AuthCard title="Join your organization" subtitle="Enter the organization code your support contact gave you.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className={labelClass}>
              Organization code
            </label>
            <input
              id="code"
              type="text"
              required
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} text-center text-lg tracking-widest`}
              placeholder="ABC-7X92K"
            />
          </div>
          {error && <p className={errorTextClass}>{error}</p>}
          <button type="submit" disabled={loading || !code.trim()} className={buttonClass}>
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Have a join link instead? Just open it directly.
          <br />
          Already have an account?{" "}
          <Link href="/login" className={linkClass}>
            Sign in
          </Link>
        </p>
      </AuthCard>
    </main>
  );
}
