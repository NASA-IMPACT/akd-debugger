"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { permissionsApi } from "@/lib/api/permissions";
import { rolesApi } from "@/lib/api/roles";

type PermissionEffect = "inherit" | "allow" | "deny";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function effectMapFromRows(rows: Array<{ permission_id: number; effect: "allow" | "deny" }>): Record<number, PermissionEffect> {
  const map: Record<number, PermissionEffect> = {};
  rows.forEach((row) => {
    map[row.permission_id] = row.effect;
  });
  return map;
}

export default function RolesSettingsPage() {
  const queryClient = useQueryClient();
  const [orgRoleName, setOrgRoleName] = useState("");
  const [orgRoleSlug, setOrgRoleSlug] = useState("");
  const [projectRoleName, setProjectRoleName] = useState("");
  const [projectRoleSlug, setProjectRoleSlug] = useState("");
  const [selectedOrgRoleId, setSelectedOrgRoleId] = useState("");
  const [selectedProjectRoleId, setSelectedProjectRoleId] = useState("");
  const [orgPermissionOverrides, setOrgPermissionOverrides] = useState<Record<number, PermissionEffect>>({});
  const [projectPermissionOverrides, setProjectPermissionOverrides] = useState<Record<number, PermissionEffect>>({});
  const [pageError, setPageError] = useState<string | null>(null);

  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions-catalog-for-roles"],
    queryFn: () => permissionsApi.list(),
  });
  const { data: orgRoles = [] } = useQuery({
    queryKey: ["org-roles"],
    queryFn: () => rolesApi.listOrganization(),
  });
  const { data: projectRoles = [] } = useQuery({
    queryKey: ["project-roles"],
    queryFn: () => rolesApi.listProject(),
  });

  const effectiveSelectedOrgRoleId = useMemo(() => {
    if (selectedOrgRoleId && orgRoles.some((role) => String(role.id) === selectedOrgRoleId)) {
      return selectedOrgRoleId;
    }
    return orgRoles[0] ? String(orgRoles[0].id) : "";
  }, [orgRoles, selectedOrgRoleId]);
  const effectiveSelectedProjectRoleId = useMemo(() => {
    if (selectedProjectRoleId && projectRoles.some((role) => String(role.id) === selectedProjectRoleId)) {
      return selectedProjectRoleId;
    }
    return projectRoles[0] ? String(projectRoles[0].id) : "";
  }, [projectRoles, selectedProjectRoleId]);
  const selectedOrgRoleIdNum = effectiveSelectedOrgRoleId ? Number(effectiveSelectedOrgRoleId) : null;
  const selectedProjectRoleIdNum = effectiveSelectedProjectRoleId ? Number(effectiveSelectedProjectRoleId) : null;

  const {
    data: orgRolePermissions = [],
    refetch: refetchOrgRolePermissions,
  } = useQuery({
    queryKey: ["org-role-permissions", selectedOrgRoleIdNum],
    queryFn: () => rolesApi.listOrganizationPermissions(selectedOrgRoleIdNum as number),
    enabled: selectedOrgRoleIdNum !== null,
  });
  const {
    data: projectRolePermissions = [],
    refetch: refetchProjectRolePermissions,
  } = useQuery({
    queryKey: ["project-role-permissions", selectedProjectRoleIdNum],
    queryFn: () => rolesApi.listProjectPermissions(selectedProjectRoleIdNum as number),
    enabled: selectedProjectRoleIdNum !== null,
  });

  const orgPermissionBaseEffects = useMemo(
    () => effectMapFromRows(orgRolePermissions),
    [orgRolePermissions]
  );
  const projectPermissionBaseEffects = useMemo(
    () => effectMapFromRows(projectRolePermissions),
    [projectRolePermissions]
  );

  const groupedPermissions = useMemo(() => {
    const map = new Map<string, typeof permissions>();
    permissions.forEach((permission) => {
      const key = permission.resource;
      const current = map.get(key) ?? [];
      current.push(permission);
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([resource, rows]) => ({
      resource,
      rows: rows.slice().sort((a, b) => a.action.localeCompare(b.action)),
    }));
  }, [permissions]);

  const createOrgRole = useMutation({
    mutationFn: () =>
      rolesApi.createOrganization(
        orgRoleName.trim(),
        (orgRoleSlug.trim() || slugify(orgRoleName)).trim()
      ),
    onSuccess: async (created) => {
      setOrgRoleName("");
      setOrgRoleSlug("");
      setSelectedOrgRoleId(String(created.id));
      setOrgPermissionOverrides({});
      setPageError(null);
      await queryClient.invalidateQueries({ queryKey: ["org-roles"] });
    },
    onError: (err) => setPageError(err instanceof Error ? err.message : "Failed to create organization role"),
  });

  const createProjectRole = useMutation({
    mutationFn: () =>
      rolesApi.createProject(
        projectRoleName.trim(),
        (projectRoleSlug.trim() || slugify(projectRoleName)).trim()
      ),
    onSuccess: async (created) => {
      setProjectRoleName("");
      setProjectRoleSlug("");
      setSelectedProjectRoleId(String(created.id));
      setProjectPermissionOverrides({});
      setPageError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-roles"] });
    },
    onError: (err) => setPageError(err instanceof Error ? err.message : "Failed to create project role"),
  });

  const saveOrgPermissions = useMutation({
    mutationFn: async () => {
      if (!selectedOrgRoleIdNum) return;
      const merged = { ...orgPermissionBaseEffects, ...orgPermissionOverrides };
      const payload = Object.entries(merged)
        .filter(([, effect]) => effect === "allow" || effect === "deny")
        .map(([permissionId, effect]) => ({
          permission_id: Number(permissionId),
          effect: effect as "allow" | "deny",
        }));
      await rolesApi.setOrganizationPermissions(selectedOrgRoleIdNum, payload);
    },
    onSuccess: async () => {
      setPageError(null);
      await refetchOrgRolePermissions();
    },
    onError: (err) => setPageError(err instanceof Error ? err.message : "Failed to save organization role permissions"),
  });

  const saveProjectPermissions = useMutation({
    mutationFn: async () => {
      if (!selectedProjectRoleIdNum) return;
      const merged = { ...projectPermissionBaseEffects, ...projectPermissionOverrides };
      const payload = Object.entries(merged)
        .filter(([, effect]) => effect === "allow" || effect === "deny")
        .map(([permissionId, effect]) => ({
          permission_id: Number(permissionId),
          effect: effect as "allow" | "deny",
        }));
      await rolesApi.setProjectPermissions(selectedProjectRoleIdNum, payload);
    },
    onSuccess: async () => {
      setPageError(null);
      await refetchProjectRolePermissions();
    },
    onError: (err) => setPageError(err instanceof Error ? err.message : "Failed to save project role permissions"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Roles & Role Permissions</h1>
      <p className="text-sm text-muted">
        Assign permissions to each role using explicit dropdowns. Leave a permission as <span className="font-semibold">inherit</span> to use default access.
      </p>
      {pageError && <div className="text-sm text-red-500">{pageError}</div>}

      <section className="clean-section space-y-3">
        <h2 className="font-semibold">Organization Roles</h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            className="rounded-md border border-border px-3 py-1.5 bg-card"
            value={orgRoleName}
            onChange={(e) => setOrgRoleName(e.target.value)}
            placeholder="Role name (e.g. Billing Manager)"
          />
          <input
            className="rounded-md border border-border px-3 py-1.5 bg-card"
            value={orgRoleSlug}
            onChange={(e) => setOrgRoleSlug(e.target.value)}
            placeholder="Slug (auto if blank)"
          />
          <button
            onClick={() => createOrgRole.mutate()}
            className="btn-subtle btn-subtle-primary"
            disabled={createOrgRole.isPending || orgRoleName.trim().length === 0}
          >
            {createOrgRole.isPending ? "Creating..." : "Create role"}
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] items-end">
          <label className="text-sm text-muted">
            Select role to edit
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={effectiveSelectedOrgRoleId}
              onChange={(e) => {
                setSelectedOrgRoleId(e.target.value);
                setOrgPermissionOverrides({});
              }}
            >
              {orgRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {role.name} ({role.slug}){role.is_builtin ? " · built-in" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-subtle"
            disabled={saveOrgPermissions.isPending || !selectedOrgRoleIdNum}
            onClick={() => saveOrgPermissions.mutate()}
          >
            {saveOrgPermissions.isPending ? "Saving..." : "Save organization permissions"}
          </button>
        </div>
        <div className="space-y-3">
          {groupedPermissions.map((group) => (
            <div key={group.resource} className="rounded-md border border-border">
              <div className="px-3 py-2 border-b border-border text-sm font-medium">{group.resource}</div>
              <div className="p-2 space-y-1">
                {group.rows.map((permission) => (
                  <div key={permission.id} className="clean-list-row px-3 py-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px] items-center">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">{permission.key}</div>
                      {permission.description && <div className="text-xs text-muted truncate">{permission.description}</div>}
                    </div>
                    <select
                      className="rounded-md border border-border px-2 py-1.5 bg-card text-xs"
                      value={
                        Object.prototype.hasOwnProperty.call(orgPermissionOverrides, permission.id)
                          ? orgPermissionOverrides[permission.id]
                          : (orgPermissionBaseEffects[permission.id] ?? "inherit")
                      }
                      onChange={(e) =>
                        setOrgPermissionOverrides((prev) => ({
                          ...prev,
                          [permission.id]: e.target.value as PermissionEffect,
                        }))
                      }
                    >
                      <option value="inherit">inherit</option>
                      <option value="allow">allow</option>
                      <option value="deny">deny</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="clean-section space-y-3">
        <h2 className="font-semibold">Project Roles</h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            className="rounded-md border border-border px-3 py-1.5 bg-card"
            value={projectRoleName}
            onChange={(e) => setProjectRoleName(e.target.value)}
            placeholder="Role name (e.g. QA Reviewer)"
          />
          <input
            className="rounded-md border border-border px-3 py-1.5 bg-card"
            value={projectRoleSlug}
            onChange={(e) => setProjectRoleSlug(e.target.value)}
            placeholder="Slug (auto if blank)"
          />
          <button
            onClick={() => createProjectRole.mutate()}
            className="btn-subtle btn-subtle-primary"
            disabled={createProjectRole.isPending || projectRoleName.trim().length === 0}
          >
            {createProjectRole.isPending ? "Creating..." : "Create role"}
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] items-end">
          <label className="text-sm text-muted">
            Select role to edit
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={effectiveSelectedProjectRoleId}
              onChange={(e) => {
                setSelectedProjectRoleId(e.target.value);
                setProjectPermissionOverrides({});
              }}
            >
              {projectRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {role.name} ({role.slug}){role.is_builtin ? " · built-in" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-subtle"
            disabled={saveProjectPermissions.isPending || !selectedProjectRoleIdNum}
            onClick={() => saveProjectPermissions.mutate()}
          >
            {saveProjectPermissions.isPending ? "Saving..." : "Save project permissions"}
          </button>
        </div>
        <div className="space-y-3">
          {groupedPermissions.map((group) => (
            <div key={group.resource} className="rounded-md border border-border">
              <div className="px-3 py-2 border-b border-border text-sm font-medium">{group.resource}</div>
              <div className="p-2 space-y-1">
                {group.rows.map((permission) => (
                  <div key={permission.id} className="clean-list-row px-3 py-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px] items-center">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground">{permission.key}</div>
                      {permission.description && <div className="text-xs text-muted truncate">{permission.description}</div>}
                    </div>
                    <select
                      className="rounded-md border border-border px-2 py-1.5 bg-card text-xs"
                      value={
                        Object.prototype.hasOwnProperty.call(projectPermissionOverrides, permission.id)
                          ? projectPermissionOverrides[permission.id]
                          : (projectPermissionBaseEffects[permission.id] ?? "inherit")
                      }
                      onChange={(e) =>
                        setProjectPermissionOverrides((prev) => ({
                          ...prev,
                          [permission.id]: e.target.value as PermissionEffect,
                        }))
                      }
                    >
                      <option value="inherit">inherit</option>
                      <option value="allow">allow</option>
                      <option value="deny">deny</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
