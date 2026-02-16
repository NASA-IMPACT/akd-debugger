import { apiFetch } from "./client";
import type { PermissionOut, UserPermissionGrantOut } from "../types";

export const permissionsApi = {
  list: () => apiFetch<PermissionOut[]>("/api/permissions"),

  listGrants: (userId?: number) =>
    apiFetch<UserPermissionGrantOut[]>(`/api/permissions/grants${userId ? `?user_id=${userId}` : ""}`),

  createGrant: (body: {
    user_id: number;
    permission_id: number;
    effect: "allow" | "deny";
    project_id?: number | null;
    resource_type?: string | null;
    resource_id?: number | null;
    expires_at?: string | null;
  }) =>
    apiFetch<UserPermissionGrantOut>("/api/permissions/grants", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteGrant: (grantId: number) =>
    apiFetch<void>(`/api/permissions/grants/${grantId}`, {
      method: "DELETE",
    }),
};
