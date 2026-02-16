import { apiFetch } from "./client";
import type { RoleOut } from "../types";

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

  setProjectPermissions: (roleId: number, permissions: Array<{ permission_id: number; effect: "allow" | "deny" }>) =>
    apiFetch<{ ok: boolean }>(`/api/roles/project/${roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify(permissions),
    }),
};
