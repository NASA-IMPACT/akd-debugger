import { apiFetch } from "./client";
import type { AuthLoginIn, AuthPasswordForgotIn, AuthPasswordResetIn, AuthSessionOut, AuthSignupIn } from "../types";

export const authApi = {
  signup: (body: AuthSignupIn) =>
    apiFetch<AuthSessionOut>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: AuthLoginIn) =>
    apiFetch<AuthSessionOut>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () =>
    apiFetch<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    }),

  refresh: () =>
    apiFetch<AuthSessionOut>("/api/auth/refresh", {
      method: "POST",
    }),

  me: () => apiFetch<AuthSessionOut>("/api/auth/me"),

  forgotPassword: (body: AuthPasswordForgotIn) =>
    apiFetch<{ ok: boolean; reset_link?: string }>("/api/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resetPassword: (body: AuthPasswordResetIn) =>
    apiFetch<{ ok: boolean }>("/api/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminResetPassword: (userId: number) =>
    apiFetch<{ ok: boolean; temporary_password: string; reset_link: string }>(
      "/api/auth/password/admin-reset",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }
    ),
};
