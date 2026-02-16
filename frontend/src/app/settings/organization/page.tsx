"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, X } from "lucide-react";
import { organizationsApi } from "@/lib/api/organizations";
import { projectsApi } from "@/lib/api/projects";
import { useAuth } from "@/providers/auth-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import type { OrganizationOut, ProjectOut } from "@/lib/types";

type DeleteTarget =
  | { kind: "organization"; organizationId: number; name: string }
  | { kind: "project"; organizationId: number; projectId: number; name: string };

function userCountLabel(count: number | null | "na"): string {
  if (count === "na") return "Users unavailable";
  if (count === null) return "Loading users...";
  return `${count} ${count === 1 ? "user" : "users"}`;
}

export default function WorkspaceSettingsPage() {
  const queryClient = useQueryClient();
  const { organizations, refresh: refreshAuth } = useAuth();
  const { organizationId, setOrganizationId, projectId, setProjectId, reloadProjects } = useWorkspace();

  const [orgDrafts, setOrgDrafts] = useState<Record<number, string>>({});
  const [projectDrafts, setProjectDrafts] = useState<Record<number, string>>({});
  const [editingOrganizationId, setEditingOrganizationId] = useState<number | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const activeOrganizationId = organizationId ?? organizations[0]?.id ?? null;
  const activeOrganization = organizations.find((org) => org.id === activeOrganizationId) ?? null;

  const {
    data: organizationProjects = [],
    isLoading: loadingProjects,
    error: projectsError,
  } = useQuery({
    queryKey: ["workspace-settings-projects", activeOrganizationId],
    queryFn: () => projectsApi.list(true, { organizationId: activeOrganizationId }),
    enabled: activeOrganizationId !== null,
  });

  const organizationMemberQueries = useQueries({
    queries: organizations.map((org) => ({
      queryKey: ["workspace-settings-org-member-count", org.id],
      queryFn: () => organizationsApi.listMembers({ organizationId: org.id }),
      staleTime: 60_000,
    })),
  });

  const projectMemberQueries = useQueries({
    queries: organizationProjects.map((project) => ({
      queryKey: ["workspace-settings-project-member-count", activeOrganizationId, project.id],
      queryFn: () => projectsApi.listMembers(project.id, { organizationId: activeOrganizationId }),
      enabled: activeOrganizationId !== null,
      staleTime: 60_000,
    })),
  });

  const organizationMemberCounts = useMemo(() => {
    const counts = new Map<number, number | null | "na">();
    organizations.forEach((org, idx) => {
      const query = organizationMemberQueries[idx];
      if (query?.isError) {
        counts.set(org.id, "na");
        return;
      }
      const rows = query?.data;
      counts.set(org.id, Array.isArray(rows) ? rows.length : null);
    });
    return counts;
  }, [organizations, organizationMemberQueries]);

  const projectMemberCounts = useMemo(() => {
    const counts = new Map<number, number | null | "na">();
    organizationProjects.forEach((project, idx) => {
      const query = projectMemberQueries[idx];
      if (query?.isError) {
        counts.set(project.id, "na");
        return;
      }
      const rows = query?.data;
      counts.set(project.id, Array.isArray(rows) ? rows.length : null);
    });
    return counts;
  }, [organizationProjects, projectMemberQueries]);

  const renameOrganizationMutation = useMutation({
    mutationFn: ({ orgId, name }: { orgId: number; name: string }) =>
      organizationsApi.updateCurrent({ name }, { organizationId: orgId }),
    onSuccess: async () => {
      setPageError(null);
      await refreshAuth();
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings-org-member-count"] });
    },
    onError: (err) => {
      setPageError(err instanceof Error ? err.message : "Failed to rename organization");
    },
  });

  const renameProjectMutation = useMutation({
    mutationFn: ({ orgId, projectId: nextProjectId, name }: { orgId: number; projectId: number; name: string }) =>
      projectsApi.update(nextProjectId, { name }, { organizationId: orgId }),
    onSuccess: async () => {
      setPageError(null);
      await reloadProjects();
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings-projects"] });
    },
    onError: (err) => {
      setPageError(err instanceof Error ? err.message : "Failed to rename project");
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: ({ orgId }: { orgId: number }) => organizationsApi.removeCurrent({ organizationId: orgId }),
    onSuccess: async (_, variables) => {
      setPageError(null);
      if (organizationId === variables.orgId) {
        setOrganizationId(null);
        setProjectId(null);
      }
      setDeleteTarget(null);
      setDeleteConfirmation("");
      await refreshAuth();
      await reloadProjects();
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings-org-member-count"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings-projects"] });
    },
    onError: (err) => {
      setPageError(err instanceof Error ? err.message : "Failed to delete organization");
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: ({ orgId, nextProjectId }: { orgId: number; nextProjectId: number }) =>
      projectsApi.remove(nextProjectId, { organizationId: orgId }),
    onSuccess: async (_, variables) => {
      setPageError(null);
      if (projectId === variables.nextProjectId) {
        setProjectId(null);
      }
      setDeleteTarget(null);
      setDeleteConfirmation("");
      await reloadProjects();
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings-project-member-count"] });
    },
    onError: (err) => {
      setPageError(err instanceof Error ? err.message : "Failed to delete project");
    },
  });

  const projectsErrorMessage = projectsError instanceof Error ? projectsError.message : null;
  const isDeleting = deleteOrganizationMutation.isPending || deleteProjectMutation.isPending;
  const expectedDeleteName = deleteTarget?.name ?? "";
  const canConfirmDelete = deleteConfirmation.trim() === expectedDeleteName && !isDeleting;

  function getOrganizationDraft(org: OrganizationOut): string {
    return orgDrafts[org.id] ?? org.name;
  }

  function getProjectDraft(project: ProjectOut): string {
    return projectDrafts[project.id] ?? project.name;
  }

  async function onSaveOrganization(org: OrganizationOut) {
    const nextName = getOrganizationDraft(org).trim();
    if (!nextName || nextName === org.name) return;
    await renameOrganizationMutation.mutateAsync({ orgId: org.id, name: nextName });
    setOrgDrafts((prev) => ({ ...prev, [org.id]: nextName }));
    setEditingOrganizationId(null);
  }

  async function onSaveProject(project: ProjectOut) {
    if (!activeOrganizationId) return;
    const nextName = getProjectDraft(project).trim();
    if (!nextName || nextName === project.name) return;
    await renameProjectMutation.mutateAsync({
      orgId: activeOrganizationId,
      projectId: project.id,
      name: nextName,
    });
    setProjectDrafts((prev) => ({ ...prev, [project.id]: nextName }));
    setEditingProjectId(null);
  }

  function requestDeleteOrganization(org: OrganizationOut) {
    setDeleteTarget({ kind: "organization", organizationId: org.id, name: org.name });
    setDeleteConfirmation("");
  }

  function requestDeleteProject(project: ProjectOut) {
    if (!activeOrganizationId) return;
    setDeleteTarget({
      kind: "project",
      organizationId: activeOrganizationId,
      projectId: project.id,
      name: project.name,
    });
    setDeleteConfirmation("");
  }

  async function confirmDelete() {
    if (!deleteTarget || !canConfirmDelete) return;
    if (deleteTarget.kind === "organization") {
      await deleteOrganizationMutation.mutateAsync({ orgId: deleteTarget.organizationId });
      return;
    }
    await deleteProjectMutation.mutateAsync({
      orgId: deleteTarget.organizationId,
      nextProjectId: deleteTarget.projectId,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Workspace</h1>
        <p className="text-sm text-muted mt-1">Manage organizations and projects from one place.</p>
        <p className="text-xs text-muted mt-2">
          Create new organizations and projects from the top workspace picker in the navbar.
        </p>
      </div>

      {pageError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {pageError}
        </div>
      )}

      <section className="clean-section space-y-3">
        <h2 className="font-semibold">Organizations</h2>
        {organizations.length === 0 ? (
          <div className="text-sm text-muted">No organizations found.</div>
        ) : (
          organizations.map((org) => {
            const draftName = getOrganizationDraft(org);
            const isActive = org.id === activeOrganizationId;
            const isEditing = editingOrganizationId === org.id;
            const orgCount = organizationMemberCounts.get(org.id) ?? null;
            const disabled = renameOrganizationMutation.isPending || deleteOrganizationMutation.isPending;
            return (
              <div
                key={org.id}
                className={`rounded-md border px-3 py-3 ${isActive ? "border-primary/70 bg-[var(--surface-hover)]" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {org.name}
                      {isActive ? " (active)" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted">{userCountLabel(orgCount)}</div>
                    {!isEditing ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                        disabled={disabled}
                        onClick={() => {
                          setEditingOrganizationId(org.id);
                          setOrgDrafts((prev) => ({ ...prev, [org.id]: org.name }));
                        }}
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                        disabled={disabled}
                        onClick={() => {
                          setEditingOrganizationId(null);
                          setOrgDrafts((prev) => ({ ...prev, [org.id]: org.name }));
                        }}
                      >
                        <X size={12} />
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                      disabled={disabled}
                      onClick={() => requestDeleteOrganization(org)}
                      aria-label={`Delete organization ${org.name}`}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={draftName}
                      onChange={(e) =>
                        setOrgDrafts((prev) => ({
                          ...prev,
                          [org.id]: e.target.value,
                        }))
                      }
                      className="min-w-[220px] flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                      placeholder="Organization name"
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className="btn-subtle"
                      disabled={disabled || draftName.trim().length === 0 || draftName.trim() === org.name}
                      onClick={() => void onSaveOrganization(org)}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="clean-section space-y-3">
        <h2 className="font-semibold">Projects {activeOrganization ? `in ${activeOrganization.name}` : ""}</h2>
        {!activeOrganizationId ? (
          <div className="text-sm text-muted">Select an organization to manage projects.</div>
        ) : loadingProjects ? (
          <div className="text-sm text-muted">Loading projects...</div>
        ) : projectsErrorMessage ? (
          <div className="text-sm text-red-500">{projectsErrorMessage}</div>
        ) : organizationProjects.length === 0 ? (
          <div className="text-sm text-muted">No projects found for this organization.</div>
        ) : (
          organizationProjects.map((project) => {
            const draftName = getProjectDraft(project);
            const isActiveProject = project.id === projectId;
            const isEditing = editingProjectId === project.id;
            const projectCount = projectMemberCounts.get(project.id) ?? null;
            const disabled = renameProjectMutation.isPending || deleteProjectMutation.isPending;
            return (
              <div
                key={project.id}
                className={`rounded-md border px-3 py-3 ${isActiveProject ? "border-primary/70 bg-[var(--surface-hover)]" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {project.name}
                      {isActiveProject ? " (active)" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted">{userCountLabel(projectCount)}</div>
                    {!isEditing ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                        disabled={disabled}
                        onClick={() => {
                          setEditingProjectId(project.id);
                          setProjectDrafts((prev) => ({ ...prev, [project.id]: project.name }));
                        }}
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
                        disabled={disabled}
                        onClick={() => {
                          setEditingProjectId(null);
                          setProjectDrafts((prev) => ({ ...prev, [project.id]: project.name }));
                        }}
                      >
                        <X size={12} />
                        Cancel
                      </button>
                    )}
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                    disabled={disabled}
                    onClick={() => requestDeleteProject(project)}
                    aria-label={`Delete project ${project.name}`}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                </div>

                {isEditing && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={draftName}
                      onChange={(e) =>
                        setProjectDrafts((prev) => ({
                          ...prev,
                          [project.id]: e.target.value,
                        }))
                      }
                      className="min-w-[220px] flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                      placeholder="Project name"
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className="btn-subtle"
                      disabled={disabled || draftName.trim().length === 0 || draftName.trim() === project.name}
                      onClick={() => void onSaveProject(project)}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[1px]" onClick={() => setDeleteTarget(null)}>
          <div className="h-full w-full flex items-center justify-center p-4">
            <div
              className="w-full max-w-[520px] rounded-xl border border-border bg-card shadow-[0_30px_120px_rgba(0,0,0,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-border">
                <div className="text-base font-semibold text-foreground">
                  Delete {deleteTarget.kind === "organization" ? "organization" : "project"}
                </div>
                <div className="text-sm text-muted mt-1">
                  This action is permanent and cannot be reversed.
                </div>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted">
                  Type <span className="font-semibold text-foreground">{deleteTarget.name}</span> to confirm deletion.
                </p>
                <input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  placeholder={deleteTarget.name}
                  disabled={isDeleting}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn-subtle"
                    disabled={isDeleting}
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-subtle !text-red-400 !border-red-500/40 !bg-red-500/10 hover:!bg-red-500/15 hover:!text-red-300 disabled:!text-red-400/60"
                    disabled={!canConfirmDelete}
                    onClick={() => void confirmDelete()}
                  >
                    {isDeleting ? "Deleting..." : "Delete permanently"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
