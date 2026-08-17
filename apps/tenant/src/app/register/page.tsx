"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { PasswordInput } from "@/components/password-input";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass } from "@/lib/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.register({ organizationName, name, email, password });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Register your company" subtitle="Create an organization and your owner account.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="organizationName" className={labelClass}>
            Company name
          </label>
          <input
            id="organizationName"
            type="text"
            required
            minLength={2}
            maxLength={200}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className={inputClass}
            placeholder="Acme Corp"
          />
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
          <label htmlFor="email" className={labelClass}>
            Work email
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
        {error && <p className={errorTextClass}>{error}</p>}
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Creating your account…" : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
