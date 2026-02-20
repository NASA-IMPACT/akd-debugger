import { apiFetch } from "./client";
import type { RoleOut, RolePermissionOut } from "../types";

export const rolesApi = {
  listOrganization: () => apiFetch<RoleOut[]>("/api/roles/organization"),
  createOrganization: (name: string, slug: string) =>
    apiFetch<RoleOut>("/api/roles/organization", {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    }),

  listProject: () => apiFetch<RoleOut[]>("/api/roles/project"),
  createProject: (name: string, slug: string) =>
    apiFetch<RoleOut>("/api/roles/project", {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    }),

  setOrganizationPermissions: (roleId: number, permissions: Array<{ permission_id: number; effect: "allow" | "deny" }>) =>
    apiFetch<{ ok: boolean }>(`/api/roles/organization/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify(permissions),
    }),
  listOrganizationPermissions: (roleId: number) =>
    apiFetch<RolePermissionOut[]>(`/api/roles/organization/${roleId}/permissions`),

  setProjectPermissions: (roleId: number, permissions: Array<{ permission_id: number; effect: "allow" | "deny" }>) =>
    apiFetch<{ ok: boolean }>(`/api/roles/project/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify(permissions),
    }),
  listProjectPermissions: (roleId: number) =>
    apiFetch<RolePermissionOut[]>(`/api/roles/project/${roleId}/permissions`),
};
