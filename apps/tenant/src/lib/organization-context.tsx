"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { api, type Organization } from "./api";

interface OrganizationContextValue {
  organization: Organization | null;
  loading: boolean;
  /** Re-fetches /organizations/me — call after editing the org profile/logo so the sidebar/dashboard reflect it immediately. */
  refresh: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { accessToken, status } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const org = await api.getOrganization(accessToken);
      setOrganization(org);
    } catch {
      // Transient failure — chrome falls back to a generic label until the next successful fetch.
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (status === "authenticated") {
      refresh();
    } else if (status === "unauthenticated") {
      setOrganization(null);
      setLoading(false);
    }
  }, [status, refresh]);

  return <OrganizationContext.Provider value={{ organization, loading, refresh }}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return ctx;
}
