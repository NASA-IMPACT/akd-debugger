import { apiFetch } from "./client";
import type { MembershipOut, OrganizationOut } from "../types";

type OrganizationRequestOptions = {
  organizationId?: number | null;
};

function orgHeaders(options?: OrganizationRequestOptions): HeadersInit | undefined {
  if (!options?.organizationId) return undefined;
  return { "X-Org-Id": String(options.organizationId) };
}

export const organizationsApi = {
  list: () => apiFetch<OrganizationOut[]>("/api/organizations"),

  create: (name: string) =>
    apiFetch<OrganizationOut>("/api/organizations", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  current: (options?: OrganizationRequestOptions) =>
    apiFetch<OrganizationOut>("/api/organizations/current", {
      headers: orgHeaders(options),
    }),

  updateCurrent: (body: { name?: string | null }, options?: OrganizationRequestOptions) =>
    apiFetch<OrganizationOut>("/api/organizations/current", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: orgHeaders(options),
    }),

  removeCurrent: (options?: OrganizationRequestOptions) =>
    apiFetch<void>("/api/organizations/current", {
      method: "DELETE",
      headers: orgHeaders(options),
    }),

  listMembers: (options?: OrganizationRequestOptions) =>
    apiFetch<MembershipOut[]>("/api/organizations/current/members", {
      headers: orgHeaders(options),
    }),

  addMember: (userId: number, roleId?: number | null, options?: OrganizationRequestOptions) =>
    apiFetch<MembershipOut>("/api/organizations/current/members", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role_id: roleId ?? null }),
      headers: orgHeaders(options),
    }),

  updateMemberRole: (userId: number, roleId?: number | null, options?: OrganizationRequestOptions) =>
    apiFetch<MembershipOut>(`/api/organizations/current/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role_id: roleId ?? null }),
      headers: orgHeaders(options),
    }),

  removeMember: (userId: number, options?: OrganizationRequestOptions) =>
    apiFetch<void>(`/api/organizations/current/members/${userId}`, {
      method: "DELETE",
      headers: orgHeaders(options),
    }),
};
