"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/providers/auth-provider";

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation_token");
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup({
        full_name: fullName,
        email,
        password,
        invitation_token: invitationToken,
      });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] grid place-items-center py-8">
      <div className="w-full max-w-md panel p-6 sm:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] tracking-wide uppercase text-muted-light font-semibold">
          New workspace
        </div>
        <h1 className="text-2xl font-semibold mt-3 mb-1">Create your account</h1>
        <p className="text-sm text-muted mb-6">Start with a personal organization and invite your team later.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name</label>
            <input className="w-full px-3 py-2.5 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input className="w-full px-3 py-2.5 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input className="w-full px-3 py-2.5 text-sm" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {invitationToken && <div className="text-xs text-muted">Invitation token detected. You will be joined to the invited organization.</div>}
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button disabled={loading} className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="mt-5 text-sm text-muted">
          Already have an account? <Link href="/login" className="text-brand no-underline hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
