"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { api, ApiError } from "@/lib/api";
import { buttonClass, errorTextClass, inputClass, labelClass, linkClass, successTextClass } from "@/lib/ui";

export default function RegisterPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.register({ organizationName, name, email, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthCard title="Check your email" subtitle="We sent a verification link to your inbox.">
        <p className={successTextClass}>
          Registration successful. Please check {email} for a link to verify your account before logging in.
        </p>
        <Link href="/login" className={`${linkClass} block text-center text-sm`}>
          Back to sign in
        </Link>
      </AuthCard>
    );
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
          <input
            id="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
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
