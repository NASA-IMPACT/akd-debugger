"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bell,
  Bot,
  Command,
  Database,
  LayoutDashboard,
  Moon,
  Plus,
  Scale,
  Search,
  Settings,
  Sun,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "akd:open-command-palette";

type PaletteCommand = {
  id: string;
  title: string;
  subtitle?: string;
  group: "Navigation" | "Workspace" | "Actions";
  keywords: string;
  icon: LucideIcon;
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette() {
  const { user } = useAuth();
  const { projectId, projects } = useWorkspace();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const currentProjectId = projectId ?? projects[0]?.id ?? null;

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "nav-benchmarks",
        title: "Open Benchmarks",
        subtitle: "Go to benchmark dashboard",
        group: "Navigation",
        keywords: "home dashboard benchmarks",
        icon: LayoutDashboard,
        run: () => router.push("/"),
      },
      {
        id: "nav-runs",
        title: "Open Runs",
        subtitle: "View active and past runs",
        group: "Navigation",
        keywords: "runs jobs benchmark",
        icon: ArrowRight,
        run: () => router.push("/runs"),
      },
      {
        id: "nav-datasets",
        title: "Open Datasets",
        subtitle: "Browse suites and queries",
        group: "Navigation",
        keywords: "datasets suites queries",
        icon: Database,
        run: () => router.push("/datasets"),
      },
      {
        id: "nav-agents",
        title: "Open Agents",
        subtitle: "Manage agent configs",
        group: "Navigation",
        keywords: "agents models prompts",
        icon: Bot,
        run: () => router.push("/agents"),
      },
      {
        id: "nav-compare",
        title: "Open Compare",
        subtitle: "Compare benchmark runs",
        group: "Navigation",
        keywords: "compare diff",
        icon: Scale,
        run: () => router.push("/compare"),
      },
      {
        id: "nav-traces",
        title: "Open Traces",
        subtitle: "Inspect trace logs",
        group: "Navigation",
        keywords: "traces logs debug",
        icon: Workflow,
        run: () => router.push("/traces"),
      },
      {
        id: "workspace-new-run",
        title: "Create New Run",
        subtitle: "Start benchmark execution",
        group: "Workspace",
        keywords: "new run create benchmark",
        icon: Plus,
        run: () => router.push("/runs/new"),
      },
      {
        id: "workspace-settings",
        title: "Open General Settings",
        subtitle: "Organization and account settings",
        group: "Workspace",
        keywords: "settings account organization",
        icon: Settings,
        run: () => router.push("/settings"),
      },
      {
        id: "workspace-project-settings",
        title: "Open Project Settings",
        subtitle: currentProjectId ? "Permissions, members, and roles" : "Select a project first",
        group: "Workspace",
        keywords: "project settings permissions roles members",
        icon: Settings,
        disabled: !currentProjectId,
        run: () => {
          if (!currentProjectId) return;
          router.push("/project-settings");
        },
      },
      {
        id: "workspace-notifications",
        title: "Open Notifications",
        subtitle: "View all alert history",
        group: "Workspace",
        keywords: "alerts notifications inbox",
        icon: Bell,
        run: () => router.push("/notifications"),
      },
      {
        id: "action-theme",
        title: theme === "dark" ? "Switch To Light Theme" : "Switch To Dark Theme",
        subtitle: "Toggle visual mode",
        group: "Actions",
        keywords: "theme dark light appearance",
        icon: theme === "dark" ? Sun : Moon,
        run: toggle,
      },
    ],
    [router, currentProjectId, theme, toggle],
  );

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      `${command.title} ${command.subtitle ?? ""} ${command.group} ${command.keywords}`
        .toLowerCase()
        .includes(q),
    );
  }, [commands, query]);

  const total = filteredCommands.length;
  const clampedActiveIndex = total === 0 ? -1 : Math.min(activeIndex, total - 1);

  const openPalette = useCallback(() => {
    if (!user) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, [user]);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  const runCommand = useCallback((command: PaletteCommand) => {
    if (command.disabled) return;
    closePalette();
    command.run();
  }, [closePalette]);

  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if (!user) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        closePalette();
      }
    }

    function onOpenEvent() {
      openPalette();
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, [open, user, closePalette, openPalette]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!user || !open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closePalette}
      />

      <div className="relative mx-auto mt-[10vh] w-[min(94vw,640px)] rounded-xl bg-card border border-border shadow-[0_16px_64px_rgba(0,0,0,0.24)] overflow-hidden">
        <div className="border-b border-border px-3.5 py-3 flex items-center gap-2.5">
          <Search size={16} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (total === 0) return;
                setActiveIndex((prev) => (prev + 1) % total);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (total === 0) return;
                setActiveIndex((prev) => (prev - 1 + total) % total);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (clampedActiveIndex < 0) return;
                const command = filteredCommands[clampedActiveIndex];
                if (!command) return;
                runCommand(command);
              }
            }}
            placeholder="Type a command or search..."
            className="command-palette-input w-full"
          />
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-light">
            <kbd className="px-1.5 py-0.5 rounded-md border border-border font-mono text-[10px]">Esc</kbd>
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto py-1.5">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Command size={16} className="mx-auto text-muted-light mb-2" />
              <div className="text-[13px] font-medium">No matching commands</div>
              <div className="text-xs text-muted mt-1">Try a different keyword.</div>
            </div>
          ) : (
            filteredCommands.map((command, index) => {
              const Icon = command.icon;
              const selected = index === clampedActiveIndex;
              const showGroupHeader = index === 0 || filteredCommands[index - 1].group !== command.group;
              return (
                <div key={command.id}>
                  {showGroupHeader && (
                    <div className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-light font-semibold">
                      {command.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runCommand(command)}
                    disabled={command.disabled}
                    className={cn(
                      "mx-1.5 w-[calc(100%-0.75rem)] rounded-md px-2.5 py-2 text-left transition-colors flex items-center gap-2.5",
                      selected
                        ? "bg-[var(--surface-hover)]"
                        : "hover:bg-[var(--surface)]",
                      command.disabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <Icon size={15} className={selected ? "text-foreground" : "text-muted"} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium truncate">{command.title}</span>
                      {command.subtitle && <span className="block text-xs text-muted truncate">{command.subtitle}</span>}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-3.5 py-2 text-[11px] text-muted flex items-center justify-between">
          <span>Use arrow keys and Enter to execute</span>
          <span className="font-mono text-[10px]">Cmd/Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
