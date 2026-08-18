"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type PublicUser } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  status: AuthStatus;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches /auth/me and updates the cached user — call after editing name/avatar so the sidebar/profile reflect it immediately. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_DENIED_MESSAGE = "This portal is for platform administrators only.";

/**
 * Step 22: after any successful authentication (session restore or fresh login), the
 * caller's role must be PLATFORM_ADMIN or access is denied — this app never treats a
 * TENANT_OWNER/SUPPORT_AGENT/CUSTOMER as logged in, even though `/auth/login` itself
 * doesn't know or care which frontend is calling it. This is a UX convenience only: every
 * `/admin/*` endpoint independently re-enforces PLATFORM_ADMIN server-side regardless of
 * what this check does (see AdminController's `@Roles` guard + AdminService's own check).
 */
function isPlatformAdmin(user: PublicUser): boolean {
  return user.role === "PLATFORM_ADMIN";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null, status: "loading" });

  const restoreSession = useCallback(async () => {
    try {
      const res = await api.refresh();
      if (!res.accessToken) {
        setState({ user: null, accessToken: null, status: "unauthenticated" });
        return;
      }
      const user = await api.me(res.accessToken);
      if (!isPlatformAdmin(user)) {
        await api.logout().catch(() => {});
        setState({ user: null, accessToken: null, status: "unauthenticated" });
        return;
      }
      setState({ user, accessToken: res.accessToken, status: "authenticated" });
    } catch {
      setState({ user: null, accessToken: null, status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    restoreSession();
    // Only ever needs to run once on mount to attempt silent session restore via the refresh cookie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    if (!isPlatformAdmin(res.user)) {
      await api.logout().catch(() => {});
      throw new ApiError(ACCESS_DENIED_MESSAGE, 403);
    }
    setState({ user: res.user, accessToken: res.accessToken, status: "authenticated" });
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setState({ user: null, accessToken: null, status: "unauthenticated" });
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.accessToken) return;
    const user = await api.me(state.accessToken);
    setState((s) => ({ ...s, user }));
  }, [state.accessToken]);

  return <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
