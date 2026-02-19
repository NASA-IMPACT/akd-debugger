"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { AUTH_UNAUTHORIZED_EVENT } from "@/lib/api/client";
import type { AuthLoginIn, AuthSessionOut, AuthSignupIn, OrganizationOut, UserOut } from "@/lib/types";

type AuthContextValue = {
  loading: boolean;
  session: AuthSessionOut | null;
  user: UserOut | null;
  organizations: OrganizationOut[];
  refresh: () => Promise<void>;
  login: (body: AuthLoginIn) => Promise<void>;
  signup: (body: AuthSignupIn) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSessionOut | null>(null);
  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setSession(me);
    } catch {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await authApi.me();
        if (!mounted) return;
        setSession(me);
      } catch {
        if (!mounted) return;
        clearSession();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clearSession]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearSession();
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clearSession]);

  const login = useCallback(async (body: AuthLoginIn) => {
    const next = await authApi.login(body);
    setSession(next);
  }, []);

  const signup = useCallback(async (body: AuthSignupIn) => {
    const next = await authApi.signup(body);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      organizations: session?.organizations ?? [],
      refresh,
      login,
      signup,
      logout,
    }),
    [loading, session, refresh, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
