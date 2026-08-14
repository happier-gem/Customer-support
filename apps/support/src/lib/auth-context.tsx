"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type PublicUser } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  status: AuthStatus;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
      setState({ user, accessToken: res.accessToken, status: "authenticated" });
    } catch {
      setState({ user: null, accessToken: null, status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setState({ user: res.user, accessToken: res.accessToken, status: "authenticated" });
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setState({ user: null, accessToken: null, status: "unauthenticated" });
  }, []);

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
