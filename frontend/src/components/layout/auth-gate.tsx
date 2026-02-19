"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/forgot-password", "/reset-password"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.has(pathname);
    if (!user && !isPublic) {
      const next = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (user && isPublic) {
      router.replace("/");
    }
  }, [loading, user, pathname, searchParams, router]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted">Loading...</div>;
  }

  const isPublic = PUBLIC_PATHS.has(pathname);
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;
  return <>{children}</>;
}
