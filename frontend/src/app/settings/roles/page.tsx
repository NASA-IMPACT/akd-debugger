"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatRoleNameForViewer, formatRoleSlugForViewer } from "@/lib/existential-mode";
import { permissionsApi } from "@/lib/api/permissions";
import { rolesApi } from "@/lib/api/roles";
import { useAuth } from "@/providers/auth-provider";

type PermissionEffect = "inherit" | "allow" | "deny";
const PROTECTED_ORG_ROLE_SLUGS = new Set(["org_admin", "org_user"]);

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

export default function OrganizationRolesSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [orgRoleName, setOrgRoleName] = useState("");
  const [orgRoleSlug, setOrgRoleSlug] = useState("");
  const [selectedOrgRoleId, setSelectedOrgRoleId] = useState("");
  const [orgPermissionOverrides, setOrgPermissionOverrides] = useState<Record<number, PermissionEffect>>({});
  const [deleteRoleId, setDeleteRoleId] = useState("");
  const [replacementRoleId, setReplacementRoleId] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);

  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions-catalog-for-org-roles"],
    queryFn: () => permissionsApi.list(),
  });
  const { data: orgRoles = [] } = useQuery({
    queryKey: ["org-roles"],
    queryFn: () => rolesApi.listOrganization(),
  });

  const effectiveSelectedOrgRoleId = useMemo(() => {
    if (selectedOrgRoleId && orgRoles.some((role) => String(role.id) === selectedOrgRoleId)) {
      return selectedOrgRoleId;
    }
    return orgRoles[0] ? String(orgRoles[0].id) : "";
  }, [orgRoles, selectedOrgRoleId]);
  const selectedOrgRoleIdNum = effectiveSelectedOrgRoleId ? Number(effectiveSelectedOrgRoleId) : null;

  const {
    data: orgRolePermissions = [],
    refetch: refetchOrgRolePermissions,
  } = useQuery({
    queryKey: ["org-role-permissions", selectedOrgRoleIdNum],
    queryFn: () => rolesApi.listOrganizationPermissions(selectedOrgRoleIdNum as number),
    enabled: selectedOrgRoleIdNum !== null,
  });

  const orgPermissionBaseEffects = useMemo(
    () => effectMapFromRows(orgRolePermissions),
    [orgRolePermissions]
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

  const deletableRoles = orgRoles.filter(
    (role) => !role.is_builtin && !PROTECTED_ORG_ROLE_SLUGS.has(role.slug)
  );
  const deleteRoleIdNum = deleteRoleId ? Number(deleteRoleId) : null;
  const replacementRoleIdNum = replacementRoleId ? Number(replacementRoleId) : null;
  const roleToDelete = orgRoles.find((role) => String(role.id) === deleteRoleId) ?? null;

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

  const deleteRoleMutation = useMutation({
    mutationFn: async () => {
      if (!deleteRoleIdNum) throw new Error("Select a role to delete");
      await rolesApi.deleteOrganization(deleteRoleIdNum, replacementRoleIdNum);
    },
    onSuccess: async () => {
      const deleted = deleteRoleIdNum;
      const replacement = replacementRoleIdNum;
      setPageError(null);
      setDeleteRoleId("");
      setReplacementRoleId("");
      if (deleted !== null && String(deleted) === selectedOrgRoleId) {
        setSelectedOrgRoleId(replacement ? String(replacement) : "");
      }
      await queryClient.invalidateQueries({ queryKey: ["org-roles"] });
      await queryClient.invalidateQueries({ queryKey: ["org-role-permissions"] });
    },
    onError: (err) => setPageError(err instanceof Error ? err.message : "Failed to delete organization role"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Organization Roles & Permissions</h1>
      <p className="text-sm text-muted">
        Manage organization-level roles here. Project roles are managed in Project Settings.
      </p>
      {pageError && <div className="text-sm text-red-500">{pageError}</div>}

      <section className="clean-section space-y-3">
        <h2 className="font-semibold">Create Role</h2>
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
      </section>

      <section className="clean-section space-y-3">
        <h2 className="font-semibold">Edit Permissions</h2>
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
                  {formatRoleNameForViewer(role.name, user?.email)} ({formatRoleSlugForViewer(role.slug, user?.email)}){role.is_builtin ? " · built-in" : ""}
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
        <h2 className="font-semibold text-red-500">Delete Role</h2>
        <p className="text-xs text-muted">
          Default and built-in roles cannot be deleted. If active users are assigned to a role, choose a replacement role before deleting.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-xs text-muted">
            Role to delete
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={deleteRoleId}
              onChange={(e) => {
                setDeleteRoleId(e.target.value);
                if (e.target.value && e.target.value === replacementRoleId) setReplacementRoleId("");
              }}
            >
              <option value="">Select role</option>
              {deletableRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {formatRoleNameForViewer(role.name, user?.email)} ({formatRoleSlugForViewer(role.slug, user?.email)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Replacement role (optional unless role is in use)
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={replacementRoleId}
              onChange={(e) => setReplacementRoleId(e.target.value)}
            >
              <option value="">None</option>
              {orgRoles
                .filter((role) => String(role.id) !== deleteRoleId)
                .map((role) => (
                  <option key={role.id} value={String(role.id)}>
                    {formatRoleNameForViewer(role.name, user?.email)} ({formatRoleSlugForViewer(role.slug, user?.email)})
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="btn-subtle !text-red-500 !border-red-500/40 hover:!bg-red-500/10"
          disabled={deleteRoleMutation.isPending || !deleteRoleId}
          onClick={() => {
            if (!roleToDelete) return;
            const roleLabel = `${formatRoleNameForViewer(roleToDelete.name, user?.email)} (${formatRoleSlugForViewer(roleToDelete.slug, user?.email)})`;
            const ok = window.confirm(
              replacementRoleId
                ? `Are you sure you want to delete role ${roleLabel}? Assigned users will be moved to the selected replacement role.`
                : `Are you sure you want to delete role ${roleLabel}?`
            );
            if (!ok) return;
            deleteRoleMutation.mutate();
          }}
        >
          {deleteRoleMutation.isPending ? "Deleting..." : "Delete role"}
        </button>
      </section>
    </div>
  );
}
