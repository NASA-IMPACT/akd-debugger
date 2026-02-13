"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTagFilter } from "@/providers/tag-filter-provider";
import { useTheme } from "@/hooks/use-theme";
import { notificationsApi } from "@/lib/api/notifications";
import { cn } from "@/lib/utils";
import { Bell, Filter, Menu, Moon, Sun, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

const links = [
  { href: "/", label: "Benchmarks" },
  { href: "/runs", label: "Runs" },
  { href: "/datasets", label: "Datasets" },
  { href: "/agents", label: "Agents" },
  { href: "/compare", label: "Compare" },
  { href: "/traces", label: "Traces" },
];

export function Navbar() {
  const pathname = usePathname();
  const { tag, setTag, allTags } = useTagFilter();
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const { data: unreadNotifications = [] } = useQuery({
    queryKey: ["notifications", "unread-preview"],
    queryFn: () => notificationsApi.list({ unreadOnly: true, limit: 8 }),
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const readMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="bg-card sticky top-0 z-50 border-b border-border">
      <div className="h-14 px-4 md:px-8 flex items-center justify-between">
        {/* Left: logo + desktop links */}
        <div className="flex items-center gap-1">
          <Link href="/" className="text-foreground font-extrabold text-lg mr-4 md:mr-8 tracking-wide no-underline">
            axiom
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-4 py-2 rounded-lg font-semibold text-sm no-underline transition-colors duration-150",
                  isActive(l.href)
                    ? "text-foreground bg-[var(--surface-hover)]"
                    : "text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Filter size={14} className="text-muted-light" />
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="bg-card text-foreground border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-[var(--surface-hover)]"
            >
              <option value="">all</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors duration-150"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 rounded-lg text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors duration-150"
              title="Notifications"
            >
              <Bell size={18} />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] font-semibold text-center">
                  {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] max-h-[420px] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">Notifications</div>
                  <button
                    className="text-xs px-2 py-1 rounded-md border border-border bg-[var(--surface-hover)] text-muted-light hover:text-foreground disabled:opacity-50"
                    onClick={() => readAllMutation.mutate()}
                    disabled={readAllMutation.isPending || unreadNotifications.length === 0}
                  >
                    Mark all read
                  </button>
                </div>
                {unreadNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <div className="text-sm font-semibold text-foreground">All caught up</div>
                    <div className="text-xs text-muted mt-1">No new notifications.</div>
                  </div>
                ) : (
                  <div className="max-h-[320px] overflow-y-auto divide-y divide-border">
                    {unreadNotifications.map((n) => (
                      <div key={n.id} className="p-3">
                        <div className="text-sm font-semibold text-foreground">{n.title}</div>
                        <div className="text-xs text-muted mt-0.5">{n.message}</div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-[11px] text-muted-light">{formatDate(n.created_at)}</div>
                          <div className="flex items-center gap-2">
                            {n.related_id && n.notif_type.startsWith("run_") && (
                              <Link
                                href={`/runs/${n.related_id}`}
                                className="text-xs text-brand no-underline hover:underline"
                                onClick={() => setNotifOpen(false)}
                              >
                                Open Run
                              </Link>
                            )}
                            {n.notif_type.startsWith("cost_preview_") && (
                              <Link
                                href="/runs"
                                className="text-xs text-brand no-underline hover:underline"
                                onClick={() => setNotifOpen(false)}
                              >
                                Open Runs
                              </Link>
                            )}
                            <button
                              className="text-xs px-2 py-1 rounded-md border border-border bg-[var(--surface-hover)] text-muted-light hover:text-foreground disabled:opacity-50"
                              onClick={() => readMutation.mutate(n.id)}
                              disabled={readMutation.isPending}
                            >
                              Mark read
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-3 py-2 border-t border-border flex justify-end">
                  <Link
                    href="/notifications"
                    className="text-xs text-brand no-underline hover:underline"
                    onClick={() => setNotifOpen(false)}
                  >
                    See all
                  </Link>
                </div>
              </div>
            )}
          </div>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors duration-150"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 pb-4 pt-2 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "block px-4 py-2.5 rounded-lg font-semibold text-sm no-underline transition-colors duration-150",
                isActive(l.href)
                  ? "text-foreground bg-[var(--surface-hover)]"
                  : "text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
              )}
            >
              {l.label}
            </Link>
          ))}
          {/* Tag filter in mobile drawer */}
          <div className="sm:hidden flex items-center gap-2 px-4 py-2.5">
            <Filter size={14} className="text-muted-light" />
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="bg-card text-foreground border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none flex-1"
            >
              <option value="">all tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </nav>
  );
}
