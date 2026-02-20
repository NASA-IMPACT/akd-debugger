"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsApi } from "@/lib/api/organizations";
import { permissionsApi } from "@/lib/api/permissions";
import { projectsApi } from "@/lib/api/projects";
import { useWorkspace } from "@/providers/workspace-provider";

export default function PermissionsSettingsPage() {
  const queryClient = useQueryClient();
  const { organizationId } = useWorkspace();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPermissionId, setSelectedPermissionId] = useState("");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");
  const [scopeType, setScopeType] = useState<"organization" | "project">("organization");
  const [projectId, setProjectId] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);

  const {
    data: members = [],
    error: membersError,
  } = useQuery({
    queryKey: ["permission-page-members", organizationId],
    queryFn: () => organizationsApi.listMembers({ organizationId }),
    enabled: organizationId !== null,
  });
  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: () => permissionsApi.list(),
  });
  const {
    data: projects = [],
    error: projectsError,
  } = useQuery({
    queryKey: ["permissions-page-projects", organizationId],
    queryFn: () => projectsApi.list(true, { organizationId }),
    enabled: organizationId !== null,
  });
  const grantsUserFilter = filterUserId ? Number(filterUserId) : undefined;
  const { data: grants = [], refetch: refetchGrants } = useQuery({
    queryKey: ["permission-grants", organizationId, grantsUserFilter],
    queryFn: () => permissionsApi.listGrants(grantsUserFilter),
    enabled: organizationId !== null,
  });

  const userLabelById = useMemo(() => {
    const map = new Map<number, string>();
    members.forEach((member) => {
      map.set(member.user_id, member.user_full_name || member.user_email || `User #${member.user_id}`);
    });
    return map;
  }, [members]);
  const permissionKeyById = useMemo(() => {
    const map = new Map<number, string>();
    permissions.forEach((permission) => {
      map.set(permission.id, permission.key);
    });
    return map;
  }, [permissions]);
  const projectNameById = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach((project) => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const createGrant = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !selectedPermissionId) {
        throw new Error("Select a user and permission");
      }
      const parsedResourceId = resourceId.trim() ? Number(resourceId.trim()) : null;
      if (resourceType.trim() && (parsedResourceId === null || Number.isNaN(parsedResourceId))) {
        throw new Error("Provide a valid resource ID when resource type is set");
      }
      if (!resourceType.trim() && resourceId.trim()) {
        throw new Error("Set resource type before resource ID");
      }
      const selectedProjectId = scopeType === "project" && projectId ? Number(projectId) : null;

      await permissionsApi.createGrant({
        user_id: Number(selectedUserId),
        permission_id: Number(selectedPermissionId),
        effect,
        project_id: selectedProjectId,
        resource_type: resourceType.trim() || null,
        resource_id: parsedResourceId,
      });
    },
    onSuccess: async () => {
      setPageError(null);
      setResourceType("");
      setResourceId("");
      await refetchGrants();
      await queryClient.invalidateQueries({ queryKey: ["permission-grants"] });
    },
    onError: (err) => {
      setPageError(err instanceof Error ? err.message : "Failed to create user grant");
    },
  });

  const deleteGrant = useMutation({
    mutationFn: (grantId: number) => permissionsApi.deleteGrant(grantId),
    onSuccess: async () => {
      setPageError(null);
      await refetchGrants();
      await queryClient.invalidateQueries({ queryKey: ["permission-grants"] });
    },
    onError: (err) => {
      setPageError(err instanceof Error ? err.message : "Failed to delete grant");
    },
  });

  const membersErrorMessage = membersError instanceof Error ? membersError.message : null;
  const projectsErrorMessage = projectsError instanceof Error ? projectsError.message : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">User Permission Overrides</h1>
      <p className="text-sm text-muted">
        Use grants for exceptions. Prefer role assignment for normal access and reserve direct grants for special cases.
      </p>
      {pageError && <div className="text-sm text-red-500">{pageError}</div>}

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Create Grant</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-xs text-muted">
            User
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select a user</option>
              {members.map((member) => (
                <option key={member.user_id} value={String(member.user_id)}>
                  {(member.user_full_name || member.user_email || `User #${member.user_id}`)} ({member.user_email || member.user_id})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Permission
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={selectedPermissionId}
              onChange={(e) => setSelectedPermissionId(e.target.value)}
            >
              <option value="">Select a permission</option>
              {permissions.map((permission) => (
                <option key={permission.id} value={String(permission.id)}>
                  {permission.key}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Effect
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={effect}
              onChange={(e) => setEffect(e.target.value as "allow" | "deny")}
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Scope
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as "organization" | "project")}
            >
              <option value="organization">Entire organization</option>
              <option value="project">Single project</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Project (optional unless scope=project)
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={scopeType !== "project"}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Object type (optional)
            <input
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              placeholder="e.g. agents, runs, datasets"
            />
          </label>
          <label className="text-xs text-muted">
            Object ID (optional)
            <input
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="Numeric ID"
            />
          </label>
        </div>
        <button
          onClick={() => createGrant.mutate()}
          className="btn-subtle btn-subtle-primary mt-3"
          disabled={createGrant.isPending || !selectedUserId || !selectedPermissionId}
        >
          {createGrant.isPending ? "Saving..." : "Create grant"}
        </button>
        {membersErrorMessage && <div className="mt-2 text-xs text-muted">Members unavailable: {membersErrorMessage}</div>}
        {projectsErrorMessage && <div className="mt-1 text-xs text-muted">Projects unavailable: {projectsErrorMessage}</div>}
      </section>

      <section className="clean-section">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <h2 className="font-semibold">Existing Grants</h2>
          <label className="text-xs text-muted">
            Filter by user
            <select
              className="mt-1 rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
            >
              <option value="">All users</option>
              {members.map((member) => (
                <option key={member.user_id} value={String(member.user_id)}>
                  {member.user_full_name || member.user_email || `User #${member.user_id}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          {grants.map((grant) => (
            <div key={grant.id} className="clean-list-row flex items-center justify-between px-3 py-2 text-sm gap-2">
              <div className="min-w-0">
                <div className="truncate">
                  <span className="font-medium">{userLabelById.get(grant.user_id) || `User #${grant.user_id}`}</span>
                  {" · "}
                  <span>{permissionKeyById.get(grant.permission_id) || `Permission #${grant.permission_id}`}</span>
                  {" · "}
                  <span className={grant.effect === "deny" ? "text-red-500" : "text-foreground"}>{grant.effect}</span>
                </div>
                <div className="text-xs text-muted truncate">
                  Scope: {grant.project_id ? `project ${projectNameById.get(grant.project_id) || `#${grant.project_id}`}` : "organization"}
                  {grant.resource_type && ` · object ${grant.resource_type}:${grant.resource_id ?? "?"}`}
                  {grant.expires_at && ` · expires ${new Date(grant.expires_at).toLocaleString()}`}
                </div>
              </div>
              <button
                onClick={() => deleteGrant.mutate(grant.id)}
                className="text-red-500"
                disabled={deleteGrant.isPending}
              >
                Delete
              </button>
            </div>
          ))}
          {grants.length === 0 && <div className="text-sm text-muted">No grants found.</div>}
        </div>
      </section>
    </div>
  );
}
