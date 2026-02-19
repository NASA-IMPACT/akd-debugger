"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { useAuth } from "@/providers/auth-provider";

export default function PasswordResetSettingsPage() {
  const { user } = useAuth();
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const forgotMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) {
        throw new Error("No active user email found");
      }
      return authApi.forgotPassword({ email: user.email });
    },
    onSuccess: (result) => {
      setErrorMessage(null);
      setResetLink(result.reset_link ?? null);
    },
    onError: (err) => {
      setResetLink(null);
      setErrorMessage(err instanceof Error ? err.message : "Could not create password reset link");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Password Reset</h1>
        <p className="text-sm text-muted mt-1">Generate a secure reset link for your account.</p>
      </div>

      <section className="clean-section space-y-3">
        <div className="text-sm text-foreground">
          Reset email target: <span className="font-semibold">{user?.email ?? "Unknown"}</span>
        </div>

        <button
          onClick={() => forgotMutation.mutate()}
          disabled={forgotMutation.isPending || !user?.email}
          className="btn-subtle btn-subtle-primary"
        >
          {forgotMutation.isPending ? "Generating..." : "Generate Reset Link"}
        </button>

        {errorMessage && <div className="text-sm text-red-500">{errorMessage}</div>}

        {resetLink && (
          <div className="text-sm break-all border border-border rounded-lg px-3 py-2 bg-[var(--surface-hover)]">
            <div className="text-xs text-muted mb-1">Reset Link</div>
            <a href={resetLink} className="text-brand" target="_blank" rel="noreferrer">
              {resetLink}
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
