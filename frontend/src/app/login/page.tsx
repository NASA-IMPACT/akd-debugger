"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/providers/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      router.replace(params.get("next") || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] grid place-items-center py-8">
      <div className="w-full max-w-md panel p-6 sm:p-7">
        <Image src="/headerLogo.png" alt="AKD logo" width={110} height={26} className="h-[26px] w-auto mb-3" />
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] tracking-wide uppercase text-muted-light font-semibold">
          Welcome back
        </div>
        <h1 className="text-2xl font-semibold mt-3 mb-1">Sign in to AKD</h1>
        <p className="text-sm text-muted mb-6">Continue benchmarking with your workspace setup.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input className="w-full px-3 py-2.5 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input className="w-full px-3 py-2.5 text-sm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button disabled={loading} className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-5 text-sm text-muted flex justify-between">
          <Link href="/signup" className="text-brand no-underline hover:underline">Create account</Link>
          <Link href="/forgot-password" className="text-brand no-underline hover:underline">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
