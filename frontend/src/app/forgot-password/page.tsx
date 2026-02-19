"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authApi } from "@/lib/api/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResetLink(null);
    setLoading(true);
    try {
      const res = await authApi.forgotPassword({ email });
      setResetLink(res.reset_link || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request reset link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] grid place-items-center py-8">
      <div className="w-full max-w-md panel p-6 sm:p-7">
        <h1 className="text-2xl font-semibold mb-1">Forgot password</h1>
        <p className="text-sm text-muted mb-6">Generate a reset link for your account.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input className="w-full px-3 py-2.5 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          {resetLink && (
            <div className="text-xs break-all rounded-lg border border-border p-3 bg-[var(--surface)]">
              Reset link: <a href={resetLink} className="text-brand">{resetLink}</a>
            </div>
          )}
          <button disabled={loading} className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
            {loading ? "Generating..." : "Generate reset link"}
          </button>
        </form>
        <div className="mt-5 text-sm"><Link href="/login" className="text-brand no-underline hover:underline">Back to login</Link></div>
      </div>
    </div>
  );
}
