"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { authApi } from "@/lib/api/auth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Missing reset token");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] grid place-items-center py-8">
      <div className="w-full max-w-md panel p-6 sm:p-7">
        <h1 className="text-2xl font-semibold mb-1">Reset password</h1>
        <p className="text-sm text-muted mb-6">Set a new password for your account.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">New Password</label>
            <input className="w-full px-3 py-2.5 text-sm" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
            <input className="w-full px-3 py-2.5 text-sm" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button disabled={loading} className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
        <div className="mt-5 text-sm"><Link href="/login" className="text-brand no-underline hover:underline">Back to login</Link></div>
      </div>
    </div>
  );
}
