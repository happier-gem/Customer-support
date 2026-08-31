import { API_BASE } from "./api";

/**
 * Centralized URLs for the four separately-deployed frontends and the
 * shared API gateway, so marketing/cross-app links (landing page, footer)
 * aren't scattered as string literals through components. Defaults are the
 * actual deployed apps; each can be overridden per-environment via
 * NEXT_PUBLIC_* env vars without a code change (e.g. for a staging deploy).
 */
export const SITE_URLS = {
  customer: process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? "https://customer-support-customer.vercel.app",
  tenant: process.env.NEXT_PUBLIC_TENANT_APP_URL ?? "https://customer-support-tenant.vercel.app",
  support: process.env.NEXT_PUBLIC_SUPPORT_APP_URL ?? "https://customer-support-support.vercel.app",
  admin: process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "https://customer-support-admin-iota.vercel.app",
  /** Same gateway the rest of this app's API calls already use — see lib/api.ts. */
  api: API_BASE,
} as const;
