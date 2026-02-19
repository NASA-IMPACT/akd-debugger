"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { organizationsApi } from "@/lib/api/organizations";
import { projectsApi } from "@/lib/api/projects";
import type { ProjectOut } from "@/lib/types";
import {
  clearActiveWorkspace,
  getActiveOrganizationId,
  getActiveProjectId,
  setActiveOrganizationId,
  setActiveProjectId,
  setActiveWorkspace,
} from "@/lib/workspace";
import { useAuth } from "@/providers/auth-provider";

type WorkspaceContextValue = {
  organizationId: number | null;
  setOrganizationId: (orgId: number | null) => void;
  projectId: number | null;
  setProjectId: (projectId: number | null) => void;
  workspaceReady: boolean;
  projects: ProjectOut[];
  reloadProjects: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const DEFAULT_ORGANIZATION_NAME = "Default";
const DEFAULT_PROJECT_NAME = "Default Project";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, session, organizations, refresh: refreshAuth } = useAuth();
  const [organizationId, setOrganizationIdState] = useState<number | null>(() => {
    const raw = getActiveOrganizationId();
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  });
  const [projectId, setProjectIdState] = useState<number | null>(() => {
    const raw = getActiveProjectId();
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  });
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const workspaceReady = organizationId !== null && projectId !== null;
  const defaultOrgBootstrapAttemptedRef = useRef(false);
  const defaultProjectBootstrapAttemptedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      defaultOrgBootstrapAttemptedRef.current = false;
      defaultProjectBootstrapAttemptedRef.current.clear();
      setOrganizationIdState(null);
      setProjectIdState(null);
      setProjects([]);
      clearActiveWorkspace();
      return;
    }
    if (!organizations.length) {
      if (defaultOrgBootstrapAttemptedRef.current) return;
      defaultOrgBootstrapAttemptedRef.current = true;
      void (async () => {
        try {
          await organizationsApi.create(DEFAULT_ORGANIZATION_NAME);
          await refreshAuth();
        } catch {
          // Keep app usable even if org bootstrap fails due permissions/network.
        }
      })();
      return;
    }

    const membershipOrgIds = new Set(organizations.map((org) => org.id));
    const isCurrentValid = organizationId !== null && membershipOrgIds.has(organizationId);
    const nextOrgId = isCurrentValid
      ? organizationId
      : (session.active_organization_id ?? organizations[0]?.id ?? null);

    if (nextOrgId !== organizationId) {
      setOrganizationIdState(nextOrgId);
      setProjectIdState(null);
      setActiveWorkspace({
        organizationId: nextOrgId ? String(nextOrgId) : null,
        projectId: null,
      });
      return;
    }
    setActiveOrganizationId(nextOrgId ? String(nextOrgId) : null);
  }, [authLoading, session, organizations, organizationId, refreshAuth]);

  const reloadProjects = useCallback(async () => {
    if (authLoading) return;
    if (!session) {
      setProjects([]);
      setProjectIdState(null);
      clearActiveWorkspace();
      return;
    }
    if (!organizationId) {
      setProjects([]);
      setProjectIdState(null);
      setActiveWorkspace({
        organizationId: null,
        projectId: null,
      });
      return;
    }
    setActiveOrganizationId(String(organizationId));
    let rows = await projectsApi
      .list(false, { organizationId })
      .catch(() => []);
    if (!rows.length && !defaultProjectBootstrapAttemptedRef.current.has(organizationId)) {
      defaultProjectBootstrapAttemptedRef.current.add(organizationId);
      try {
        const created = await projectsApi.create(
          { name: DEFAULT_PROJECT_NAME },
          { organizationId }
        );
        rows = [created];
      } catch {
        // Keep app usable even if project bootstrap fails due permissions/network.
      }
    }
    setProjects(rows);

    const currentProjectExists = rows.some((p) => p.id === projectId);
    if (!currentProjectExists) {
      const nextProjectId = rows[0]?.id ?? null;
      setProjectIdState(nextProjectId);
      setActiveProjectId(nextProjectId ? String(nextProjectId) : null);
    }
  }, [authLoading, organizationId, projectId, session]);

  useEffect(() => {
    if (authLoading) return;
    void reloadProjects();
  }, [authLoading, reloadProjects]);

  const setOrganizationId = useCallback((orgId: number | null) => {
    setOrganizationIdState(orgId);
    setProjectIdState(null);
    setActiveWorkspace({
      organizationId: orgId ? String(orgId) : null,
      projectId: null,
    });
  }, []);

  const setProjectId = useCallback((nextProjectId: number | null) => {
    setProjectIdState(nextProjectId);
    setActiveWorkspace({
      organizationId: organizationId ? String(organizationId) : null,
      projectId: nextProjectId ? String(nextProjectId) : null,
    });
  }, [organizationId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      organizationId,
      setOrganizationId,
      projectId,
      setProjectId,
      workspaceReady,
      projects,
      reloadProjects,
    }),
    [organizationId, setOrganizationId, projectId, setProjectId, workspaceReady, projects, reloadProjects]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
