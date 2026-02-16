"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Scale,
  Search,
  Settings,
  Sun,
  User,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { useTheme } from "@/hooks/use-theme";
import { notificationsApi } from "@/lib/api/notifications";
import { organizationsApi } from "@/lib/api/organizations";
import { projectsApi } from "@/lib/api/projects";
import type { AppNotificationOut } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const links = [
  { href: "/", label: "Benchmarks", icon: LayoutDashboard },
  { href: "/runs", label: "Runs", icon: Activity },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/traces", label: "Traces", icon: Workflow },
];

const desktopNavGroups = [
  {
    title: "Benchmarking",
    items: ["/", "/runs", "/compare"],
  },
  {
    title: "Assets",
    items: ["/datasets", "/agents"],
  },
  {
    title: "Observability",
    items: ["/traces"],
  },
];

const COMMAND_PALETTE_EVENT = "axiom:open-command-palette";
const NAV_COLLAPSE_STORAGE_KEY = "axiom.nav.collapsed";

function isNotificationForRun(notifType: string) {
  return notifType.startsWith("run_");
}

function NotificationsDropdown({
  unreadNotifications,
  markRead,
  markAllRead,
  onClose,
  markReadPending,
  markAllPending,
  placement = "bottom",
}: {
  unreadNotifications: AppNotificationOut[];
  markRead: (id: number) => void;
  markAllRead: () => void;
  onClose: () => void;
  markReadPending: boolean;
  markAllPending: boolean;
  placement?: "top" | "bottom" | "right";
}) {
  return (
    <div
      className={cn(
        "absolute right-0 w-[min(340px,calc(100vw-2.25rem))] lg:w-[260px] rounded-lg border border-border bg-card/95 shadow-[0_16px_64px_rgba(0,0,0,0.24)] backdrop-blur-xl z-[70] overflow-hidden",
        placement === "top" && "bottom-full mb-2",
        placement === "bottom" && "top-full mt-2",
        placement === "right" && "left-full ml-2 bottom-0 lg:w-[300px]",
      )}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Notifications</div>
        {unreadNotifications.length > 0 && (
          <button
            className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground hover:bg-[var(--surface-hover)] disabled:opacity-50"
            onClick={markAllRead}
            disabled={markAllPending}
          >
            {markAllPending ? "Marking..." : "Mark all read"}
          </button>
        )}
      </div>

      {unreadNotifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="text-sm font-semibold text-foreground">All caught up</div>
          <div className="text-xs text-muted mt-1">No new notifications.</div>
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto divide-y divide-border/70">
          {unreadNotifications.map((n) => (
            <div key={n.id} className="px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{n.title}</div>
              <div className="text-xs text-muted mt-0.5">{n.message}</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted-light">{formatDate(n.created_at)}</div>
                <div className="flex items-center gap-2">
                  {n.related_id && isNotificationForRun(n.notif_type) && (
                    <Link
                      href={`/runs/${n.related_id}`}
                      className="text-xs text-brand no-underline hover:underline"
                      onClick={onClose}
                    >
                      Open Run
                    </Link>
                  )}
                  {n.notif_type.startsWith("cost_preview_") && (
                    <Link
                      href="/runs"
                      className="text-xs text-brand no-underline hover:underline"
                      onClick={onClose}
                    >
                      Open Runs
                    </Link>
                  )}
                  <button
                    className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    onClick={() => markRead(n.id)}
                    disabled={markReadPending}
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
        <Link href="/notifications" className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted no-underline hover:text-foreground hover:bg-[var(--surface-hover)]" onClick={onClose}>
          See all
        </Link>
      </div>
    </div>
  );
}

function WorkspaceModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[1px]" onClick={onClose}>
      <div className="h-full w-full flex items-center justify-center p-4">
        <div
          className="w-full max-w-[560px] rounded-xl border border-border bg-card shadow-[0_30px_120px_rgba(0,0,0,0.35)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-border">
            <div className="text-base font-semibold text-foreground">{title}</div>
            <div className="text-sm text-muted mt-1">{subtitle}</div>
          </div>
          <div className="p-5 space-y-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { user, organizations, logout, refresh: refreshAuth } = useAuth();
  const { organizationId, setOrganizationId, projectId, setProjectId, projects, reloadProjects } = useWorkspace();
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();

  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [workspaceOrgOpen, setWorkspaceOrgOpen] = useState(false);
  const [workspaceProjectOpen, setWorkspaceProjectOpen] = useState(false);
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [createOrgInitialProject, setCreateOrgInitialProject] = useState(true);
  const [newOrgProjectName, setNewOrgProjectName] = useState("Default Project");
  const [newOrgProjectDescription, setNewOrgProjectDescription] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);

  const desktopNotifRef = useRef<HTMLDivElement | null>(null);
  const mobileNotifRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const workspaceOrgRef = useRef<HTMLDivElement | null>(null);
  const workspaceProjectRef = useRef<HTMLDivElement | null>(null);

  const currentOrganizationId = organizationId ?? organizations[0]?.id ?? null;
  const currentProjectId = projectId ?? projects[0]?.id ?? null;
  const currentOrganization = organizations.find((org) => org.id === currentOrganizationId) ?? null;
  const currentProject = projects.find((project) => project.id === currentProjectId) ?? null;

  const { data: unreadNotifications = [] } = useQuery({
    queryKey: ["notifications", "unread-preview", organizationId],
    queryFn: () => notificationsApi.list({ unreadOnly: true, limit: 8 }),
    enabled: !!user && !!organizationId,
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

  const createOrganizationMutation = useMutation({
    mutationFn: async () => {
      const orgName = newOrgName.trim();
      if (!orgName) {
        throw new Error("Organization name is required");
      }
      const org = await organizationsApi.create(orgName);

      let projectIdToSelect: number | null = null;
      if (createOrgInitialProject) {
        const projectName = newOrgProjectName.trim() || "Default Project";
        const project = await projectsApi.create(
          { name: projectName, description: newOrgProjectDescription.trim() || null },
          { organizationId: org.id },
        );
        projectIdToSelect = project.id;
      }
      return { orgId: org.id, projectIdToSelect };
    },
    onSuccess: async ({ orgId, projectIdToSelect }) => {
      setCreateOrgError(null);
      await refreshAuth();
      setOrganizationId(orgId);
      setProjectId(projectIdToSelect);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["projects-settings"] }),
      ]);
      setCreateOrgModalOpen(false);
      setNewOrgName("");
      setCreateOrgInitialProject(true);
      setNewOrgProjectName("Default Project");
      setNewOrgProjectDescription("");
    },
    onError: (err) => {
      setCreateOrgError(err instanceof Error ? err.message : "Failed to create organization");
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganizationId) {
        throw new Error("Select an organization first");
      }
      const projectName = newProjectName.trim();
      if (!projectName) {
        throw new Error("Project name is required");
      }
      return projectsApi.create(
        {
          name: projectName,
          description: newProjectDescription.trim() || null,
        },
        { organizationId: currentOrganizationId },
      );
    },
    onSuccess: async (project) => {
      setCreateProjectError(null);
      setProjectId(project.id);
      await reloadProjects();
      await queryClient.invalidateQueries({ queryKey: ["projects-settings", currentOrganizationId] });
      setCreateProjectModalOpen(false);
      setNewProjectName("");
      setNewProjectDescription("");
    },
    onError: (err) => {
      setCreateProjectError(err instanceof Error ? err.message : "Failed to create project");
    },
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, navCollapsed ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, [navCollapsed]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const outsideDesktopNotif = !desktopNotifRef.current || !desktopNotifRef.current.contains(target);
      const outsideMobileNotif = !mobileNotifRef.current || !mobileNotifRef.current.contains(target);
      if (outsideDesktopNotif && outsideMobileNotif) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (projectPickerRef.current && !projectPickerRef.current.contains(target)) {
        setProjectPickerOpen(false);
      }
      if (workspaceOrgRef.current && !workspaceOrgRef.current.contains(target)) {
        setWorkspaceOrgOpen(false);
      }
      if (workspaceProjectRef.current && !workspaceProjectRef.current.contains(target)) {
        setWorkspaceProjectOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function onOrgChange(raw: string) {
    if (!raw) {
      setOrganizationId(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setOrganizationId(parsed);
      setWorkspaceOrgOpen(false);
      setWorkspaceProjectOpen(false);
    }
  }

  function onProjectChange(raw: string) {
    if (!raw) {
      setProjectId(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setProjectId(parsed);
      setWorkspaceProjectOpen(false);
    }
  }

  function openCreateOrganizationModal() {
    setWorkspaceOrgOpen(false);
    setWorkspaceProjectOpen(false);
    setCreateOrgError(null);
    setCreateOrgModalOpen(true);
  }

  function openCreateProjectModal() {
    if (!currentOrganizationId) return;
    setWorkspaceOrgOpen(false);
    setWorkspaceProjectOpen(false);
    setCreateProjectError(null);
    setCreateProjectModalOpen(true);
  }

  function openCommandPalette() {
    window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
    setMobileOpen(false);
  }

  function toggleDesktopNav() {
    setNavCollapsed((prev) => {
      const next = !prev;
      if (next) {
        setProjectPickerOpen(false);
        setUserMenuOpen(false);
      }
      return next;
    });
  }

  async function onLogout() {
    await logout();
    queryClient.clear();
    setNotifOpen(false);
    setUserMenuOpen(false);
    setMobileOpen(false);
  }

  if (!user) {
    return (
      <div className="app-shell-nav app-shell-nav--public">
        <nav className="sticky top-0 z-40 axiom-mobile-bar">
          <div className="mx-auto max-w-[1520px] h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
            <Link href="/" className="no-underline inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
                A
              </span>
              <span className="font-semibold tracking-tight text-foreground">axiom</span>
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={toggle}
                className="h-8 w-8 rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun size={15} className="mx-auto" /> : <Moon size={15} className="mx-auto" />}
              </button>
              <Link href="/login" className="text-[13px] px-3 py-1.5 rounded-md no-underline text-foreground hover:bg-[var(--surface-hover)]">
                Login
              </Link>
              <Link href="/signup" className="text-[13px] px-3 py-1.5 rounded-md bg-primary text-primary-foreground no-underline hover:brightness-110">
                Signup
              </Link>
            </div>
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className={cn("app-shell-nav app-shell-nav--app", navCollapsed && "app-shell-nav--collapsed")}>
      <header className="lg:hidden fixed top-0 inset-x-0 z-50 axiom-mobile-bar">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <Link href="/" className="no-underline inline-flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
              A
            </span>
            <span className="font-semibold text-[15px] tracking-tight">axiom</span>
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggle}
              className="h-8 w-8 rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} className="mx-auto" /> : <Moon size={15} className="mx-auto" />}
            </button>

            <div className="relative" ref={mobileNotifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative h-8 w-8 rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                title="Notifications"
              >
                <Bell size={15} className="mx-auto" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-white text-[10px] leading-[16px] font-semibold text-center">
                    {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <NotificationsDropdown
                  unreadNotifications={unreadNotifications}
                  markRead={(id) => readMutation.mutate(id)}
                  markAllRead={() => readAllMutation.mutate()}
                  onClose={() => setNotifOpen(false)}
                  markReadPending={readMutation.isPending}
                  markAllPending={readAllMutation.isPending}
                />
              )}
            </div>

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="h-8 w-8 rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X size={16} className="mx-auto" /> : <Menu size={16} className="mx-auto" />}
            </button>
          </div>
        </div>
      </header>

      <div className={cn(
        "hidden lg:flex fixed top-0 right-0 h-12 z-40 axiom-workspace-bar items-center px-4",
        navCollapsed ? "left-[72px]" : "left-[248px]",
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-light font-semibold">Organization</span>
            <div className="relative" ref={workspaceOrgRef}>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceOrgOpen((v) => !v);
                  setWorkspaceProjectOpen(false);
                }}
                className={cn(
                  "inline-flex items-center rounded-md px-1.5 py-1 text-[14px] text-foreground hover:bg-[var(--surface-hover)]",
                )}
              >
                <span className="truncate max-w-[260px]">{currentOrganization?.name ?? "No organization"}</span>
              </button>
              {workspaceOrgOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] min-w-[220px] max-w-[320px] rounded-md border border-border bg-card shadow-[0_16px_48px_rgba(0,0,0,0.18)] z-[80] overflow-hidden">
                  {organizations.length === 0 ? (
                    <div className="px-3 py-2 text-[13px] text-muted">No organizations yet.</div>
                  ) : (
                    organizations.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        className={cn(
                          "block w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--surface-hover)]",
                          org.id === currentOrganizationId ? "bg-[var(--surface-hover)] text-foreground font-medium" : "text-foreground",
                        )}
                        onClick={() => onOrgChange(String(org.id))}
                      >
                        {org.name}
                      </button>
                    ))
                  )}
                  <div className="border-t border-border p-1.5">
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                      onClick={openCreateOrganizationModal}
                    >
                      <Plus size={12} />
                      New organization
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <span className="text-muted-light text-sm" aria-hidden="true">&gt;</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-light font-semibold">Project</span>
            <div className="relative" ref={workspaceProjectRef}>
              <button
                type="button"
                onClick={() => {
                  if (!currentOrganizationId) return;
                  setWorkspaceProjectOpen((v) => !v);
                  setWorkspaceOrgOpen(false);
                }}
                className={cn(
                  "inline-flex items-center rounded-md px-1.5 py-1 text-[14px] text-foreground hover:bg-[var(--surface-hover)]",
                  !currentOrganizationId && "text-muted-light cursor-not-allowed",
                )}
              >
                <span className="truncate max-w-[240px]">{currentProject?.name ?? (projects.length ? "Select project" : "No project")}</span>
              </button>
              {workspaceProjectOpen && currentOrganizationId && (
                <div className="absolute left-0 top-[calc(100%+6px)] min-w-[200px] max-w-[300px] rounded-md border border-border bg-card shadow-[0_16px_48px_rgba(0,0,0,0.18)] z-[80] overflow-hidden">
                  {projects.length === 0 ? (
                    <div className="px-3 py-2 text-[13px] text-muted">No projects yet.</div>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className={cn(
                          "block w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--surface-hover)]",
                          project.id === currentProjectId ? "bg-[var(--surface-hover)] text-foreground font-medium" : "text-foreground",
                        )}
                        onClick={() => onProjectChange(String(project.id))}
                      >
                        {project.name}
                      </button>
                    ))
                  )}
                  <div className="border-t border-border p-1.5">
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                      onClick={openCreateProjectModal}
                    >
                      <Plus size={12} />
                      New project
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className={cn(
        "hidden lg:flex fixed inset-y-0 left-0 z-50 axiom-sidebar py-3 flex-col transition-[width,padding] duration-200",
        navCollapsed ? "w-[72px] px-2" : "w-[248px] px-3",
      )}>
        <div className={cn("flex items-center", navCollapsed ? "justify-center" : "justify-between px-1")}>
          <Link href="/" className={cn("no-underline flex items-center", navCollapsed ? "justify-center" : "gap-2 py-1.5")}>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
              A
            </span>
            {!navCollapsed && <span className="font-semibold text-foreground tracking-tight">Axiom</span>}
          </Link>
          {!navCollapsed && (
            <button
              onClick={toggleDesktopNav}
              className="h-7 w-7 rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
              title="Minimize sidebar"
              aria-label="Minimize sidebar"
            >
              <ChevronsLeft size={14} className="mx-auto" />
            </button>
          )}
        </div>
        {navCollapsed && (
          <button
            onClick={toggleDesktopNav}
            className="mt-2 h-8 w-8 self-center rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronsRight size={14} className="mx-auto" />
          </button>
        )}

        <button
          onClick={openCommandPalette}
          className={cn(
            "mt-2 inline-flex rounded-md text-muted hover:text-foreground hover:bg-[var(--surface-hover)]",
            navCollapsed
              ? "h-8 w-8 items-center justify-center self-center bg-[var(--surface)]"
              : "items-center justify-between bg-[var(--surface)] px-2.5 py-2 text-xs",
          )}
          title="Search (Cmd+K)"
          aria-label="Search"
        >
          {navCollapsed ? (
            <Search size={13} />
          ) : (
            <>
              <span className="inline-flex items-center gap-2">
                <Search size={13} />
                Search...
              </span>
              <span className="text-[10px] text-muted-light">Cmd K</span>
            </>
          )}
        </button>

        <nav className={cn("mt-3", navCollapsed ? "space-y-1 px-0.5" : "space-y-3")}>
          {navCollapsed ? (
            links.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  className={cn(
                    "group flex h-8 items-center justify-center rounded-md no-underline transition-colors",
                    isActive(link.href)
                      ? "bg-[var(--surface-hover)] text-foreground"
                      : "text-muted hover:text-foreground hover:bg-[var(--surface)]",
                  )}
                >
                  <Icon size={15} className={isActive(link.href) ? "text-foreground" : "text-muted group-hover:text-foreground"} />
                </Link>
              );
            })
          ) : (
            desktopNavGroups.map((group) => (
              <div key={group.title} className="space-y-0.5">
                <div className="px-2.5 text-[10px] uppercase tracking-wider text-muted-light font-semibold mb-1.5">{group.title}</div>
                {group.items.map((href) => {
                  const link = links.find((l) => l.href === href);
                  if (!link) return null;
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] no-underline text-[13px] transition-colors",
                        isActive(link.href)
                          ? "bg-[var(--surface-hover)] text-foreground"
                          : "text-muted hover:text-foreground hover:bg-[var(--surface)]",
                      )}
                    >
                      <Icon size={15} className={isActive(link.href) ? "text-foreground" : "text-muted group-hover:text-foreground"} />
                      <span className="font-medium">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        {!navCollapsed && (
          <div className="mt-4 space-y-2 px-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-light font-semibold px-1.5">Projects</label>
            <div className="group relative" ref={projectPickerRef}>
              <button
                type="button"
                aria-label="Active project"
                onClick={() => {
                  if (!currentOrganizationId || projects.length === 0) return;
                  setProjectPickerOpen((v) => !v);
                }}
                className={cn(
                  "w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                  currentOrganizationId && projects.length > 0
                    ? "text-foreground hover:bg-[var(--surface-hover)]"
                    : "text-muted-light cursor-not-allowed opacity-70",
                )}
              >
                <span className="truncate">
                  {currentProject?.name ?? (projects.length ? "Select project" : "No project")}
                </span>
                <ChevronDown
                  size={14}
                  className={cn(
                    "ml-auto text-muted-light transition-transform",
                    projectPickerOpen && "rotate-180",
                  )}
                />
              </button>
              {currentProjectId && (
                <Link
                  href="/project-settings"
                  aria-label="Project settings"
                  title="Project settings"
                  className="absolute right-7 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-hover)] hover:text-foreground z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectPickerOpen(false);
                  }}
                >
                  <Settings size={12} />
                </Link>
              )}
              {projectPickerOpen && projects.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] rounded-md border border-border bg-card shadow-[0_16px_48px_rgba(0,0,0,0.18)] z-[70] overflow-hidden">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className={cn(
                        "block w-full text-left px-2.5 py-2 text-[13px] hover:bg-[var(--surface-hover)]",
                        project.id === currentProjectId ? "bg-[var(--surface-hover)] text-foreground font-medium" : "text-foreground",
                      )}
                      onClick={() => {
                        setProjectId(project.id);
                        setProjectPickerOpen(false);
                      }}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={cn("mt-auto space-y-1.5", navCollapsed && "px-0.5")}>
          <div className={cn("grid gap-1.5", navCollapsed ? "grid-cols-1" : "grid-cols-2")}>
            <button
              onClick={toggle}
              className={cn("btn-subtle w-full", navCollapsed ? "h-8 px-0" : "text-xs")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
              {!navCollapsed && "Theme"}
            </button>

            <div className="relative" ref={desktopNotifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className={cn("relative btn-subtle w-full", navCollapsed ? "h-8 px-0" : "text-xs", notifOpen && "btn-subtle-primary")}
                title="Alerts"
              >
                <Bell size={13} />
                {!navCollapsed && "Alerts"}
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-white text-[10px] leading-[16px] font-semibold text-center">
                    {unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <NotificationsDropdown
                  unreadNotifications={unreadNotifications}
                  markRead={(id) => readMutation.mutate(id)}
                  markAllRead={() => readAllMutation.mutate()}
                  onClose={() => setNotifOpen(false)}
                  markReadPending={readMutation.isPending}
                  markAllPending={readAllMutation.isPending}
                  placement="right"
                />
              )}
            </div>
          </div>

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className={cn(
                "rounded-md hover:bg-[var(--surface)]",
                navCollapsed
                  ? "h-8 w-8 mx-auto flex items-center justify-center"
                  : "w-full px-2.5 py-1.5 text-left flex items-center gap-2",
              )}
              title={navCollapsed ? "Account menu" : undefined}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-hover)] text-foreground">
                <User size={12} />
              </span>
              {!navCollapsed && (
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium truncate">{user.full_name}</span>
                  <span className="block text-[11px] text-muted truncate">{user.email}</span>
                </span>
              )}
            </button>

            {userMenuOpen && (
              <div className={cn(
                "absolute rounded-lg border border-border bg-card/95 backdrop-blur-xl shadow-[0_16px_64px_rgba(0,0,0,0.24)] p-1 z-[70]",
                navCollapsed ? "left-full ml-2 bottom-0 w-[200px]" : "bottom-[calc(100%+6px)] left-0 right-0",
              )}>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] no-underline text-foreground hover:bg-[var(--surface-hover)]"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Zap size={13} />
                  General settings
                </Link>
                <button
                  onClick={() => {
                    void onLogout();
                  }}
                  className="mt-0.5 w-full text-left flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground hover:bg-[var(--surface-hover)]"
                >
                  <LogOut size={13} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {createOrgModalOpen && (
        <WorkspaceModal
          title="Create Organization"
          subtitle="Set up a new organization and optionally create its first project."
          onClose={() => {
            if (createOrganizationMutation.isPending) return;
            setCreateOrgModalOpen(false);
          }}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setCreateOrgError(null);
              createOrganizationMutation.mutate();
            }}
          >
            <div>
              <label className="block text-xs text-muted-light uppercase tracking-wider mb-1">Organization name</label>
              <input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="Acme AI"
                disabled={createOrganizationMutation.isPending}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={createOrgInitialProject}
                onChange={(e) => setCreateOrgInitialProject(e.target.checked)}
                disabled={createOrganizationMutation.isPending}
              />
              Create initial project
            </label>
            {createOrgInitialProject && (
              <>
                <div>
                  <label className="block text-xs text-muted-light uppercase tracking-wider mb-1">Project name</label>
                  <input
                    value={newOrgProjectName}
                    onChange={(e) => setNewOrgProjectName(e.target.value)}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder="Default Project"
                    disabled={createOrganizationMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-light uppercase tracking-wider mb-1">Project description</label>
                  <input
                    value={newOrgProjectDescription}
                    onChange={(e) => setNewOrgProjectDescription(e.target.value)}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    placeholder="Optional"
                    disabled={createOrganizationMutation.isPending}
                  />
                </div>
              </>
            )}
            {createOrgError && <div className="text-sm text-red-500">{createOrgError}</div>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-subtle"
                disabled={createOrganizationMutation.isPending}
                onClick={() => setCreateOrgModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-subtle btn-subtle-primary"
                disabled={newOrgName.trim().length === 0 || createOrganizationMutation.isPending}
              >
                {createOrganizationMutation.isPending ? "Creating..." : "Create organization"}
              </button>
            </div>
          </form>
        </WorkspaceModal>
      )}

      {createProjectModalOpen && (
        <WorkspaceModal
          title="Create Project"
          subtitle={currentOrganization ? `Create a project in ${currentOrganization.name}.` : "Create a project in the selected organization."}
          onClose={() => {
            if (createProjectMutation.isPending) return;
            setCreateProjectModalOpen(false);
          }}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setCreateProjectError(null);
              createProjectMutation.mutate();
            }}
          >
            <div>
              <label className="block text-xs text-muted-light uppercase tracking-wider mb-1">Project name</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="Model evals"
                disabled={createProjectMutation.isPending}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-light uppercase tracking-wider mb-1">Project description</label>
              <input
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="Optional"
                disabled={createProjectMutation.isPending}
              />
            </div>
            {createProjectError && <div className="text-sm text-red-500">{createProjectError}</div>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-subtle"
                disabled={createProjectMutation.isPending}
                onClick={() => setCreateProjectModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-subtle btn-subtle-primary"
                disabled={!currentOrganizationId || newProjectName.trim().length === 0 || createProjectMutation.isPending}
              >
                {createProjectMutation.isPending ? "Creating..." : "Create project"}
              </button>
            </div>
          </form>
        </WorkspaceModal>
      )}

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute right-0 top-0 h-full w-[min(90vw,360px)] bg-card border-l border-border p-3 pt-[4.25rem] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-0.5">
              <button
                onClick={openCommandPalette}
                className="w-full inline-flex items-center justify-between rounded-md bg-[var(--surface)] px-2.5 py-2 text-xs text-muted hover:text-foreground hover:bg-[var(--surface-hover)] mb-1"
              >
                <span className="inline-flex items-center gap-2">
                  <Search size={13} />
                  Search...
                </span>
                <span className="text-[10px] text-muted-light">Cmd K</span>
              </button>
              {links.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 no-underline text-[13px]",
                      isActive(l.href)
                        ? "bg-[var(--surface-hover)] text-foreground"
                        : "text-muted hover:text-foreground hover:bg-[var(--surface)]"
                    )}
                  >
                    <Icon size={15} />
                    <span>{l.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 space-y-2 px-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-light font-semibold px-1.5">Workspace</div>
              <select
                aria-label="Active organization"
                value={currentOrganizationId ? String(currentOrganizationId) : ""}
                onChange={(e) => onOrgChange(e.target.value)}
                className="w-full text-[13px] px-2.5 py-1.5"
              >
                {organizations.length === 0 && <option value="">No organization</option>}
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Active project"
                value={currentProjectId ? String(currentProjectId) : ""}
                onChange={(e) => onProjectChange(e.target.value)}
                className="w-full text-[13px] px-2.5 py-1.5 disabled:opacity-60"
                disabled={!currentOrganizationId || projects.length === 0}
              >
                {projects.length === 0 ? (
                  <option value="">No project</option>
                ) : (
                  projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))
                )}
              </select>
              <Link
                href={currentProjectId ? "/project-settings" : "#"}
                className={cn(
                  "mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] no-underline",
                  currentProjectId
                    ? "text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                    : "text-muted-light pointer-events-none opacity-60"
                )}
              >
                <Settings size={13} />
                Project settings
              </Link>
            </div>

            <div className="mt-4 px-1">
              <div className="text-[13px] font-medium truncate">{user.full_name}</div>
              <div className="text-xs text-muted truncate">{user.email}</div>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <Link
                  href="/settings"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] no-underline text-foreground hover:bg-[var(--surface-hover)]"
                >
                  <User size={13} />
                  Settings
                </Link>
                <button
                  onClick={() => {
                    void onLogout();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-[var(--surface-hover)]"
                >
                  <LogOut size={13} />
                  Logout
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
