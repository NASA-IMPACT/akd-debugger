import { apiFetch } from "./client";
import type { ProjectMembershipOut, ProjectOut } from "../types";

type ProjectRequestOptions = {
  organizationId?: number | null;
};

function orgHeaders(options?: ProjectRequestOptions): HeadersInit | undefined {
  if (!options?.organizationId) return undefined;
  return { "X-Org-Id": String(options.organizationId) };
}

export const projectsApi = {
  list: (includeArchived = false, options?: ProjectRequestOptions) =>
    apiFetch<ProjectOut[]>(`/api/projects?include_archived=${includeArchived ? "true" : "false"}`, {
      headers: orgHeaders(options),
    }),

  create: (body: { name: string; description?: string | null }, options?: ProjectRequestOptions) =>
    apiFetch<ProjectOut>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
      headers: orgHeaders(options),
    }),

  get: (projectId: number, options?: ProjectRequestOptions) =>
    apiFetch<ProjectOut>(`/api/projects/${projectId}`, {
      headers: orgHeaders(options),
    }),

  update: (
    projectId: number,
    body: { name?: string | null; description?: string | null; is_archived?: boolean | null },
    options?: ProjectRequestOptions
  ) =>
    apiFetch<ProjectOut>(`/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: orgHeaders(options),
    }),

  remove: (projectId: number, options?: ProjectRequestOptions) =>
    apiFetch<void>(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: orgHeaders(options),
    }),

  listMembers: (projectId: number, options?: ProjectRequestOptions) =>
    apiFetch<ProjectMembershipOut[]>(`/api/projects/${projectId}/members`, {
      headers: orgHeaders(options),
    }),

  addMember: (projectId: number, userId: number, roleId?: number | null, options?: ProjectRequestOptions) =>
    apiFetch<ProjectMembershipOut>(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role_id: roleId ?? null }),
      headers: orgHeaders(options),
    }),

  removeMember: (projectId: number, userId: number, options?: ProjectRequestOptions) =>
    apiFetch<void>(`/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
      headers: orgHeaders(options),
    }),
};
