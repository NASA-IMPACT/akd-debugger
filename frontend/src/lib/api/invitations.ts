import { apiFetch } from "./client";
import type { InvitationOut } from "../types";

export const invitationsApi = {
  list: () => apiFetch<InvitationOut[]>("/api/invitations"),

  create: (body: { email: string; org_role_id?: number | null; project_assignments?: Array<{ project_id: number; role_id?: number | null }> }) =>
    apiFetch<InvitationOut>("/api/invitations", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  revoke: (invitationId: number) =>
    apiFetch<InvitationOut>(`/api/invitations/${invitationId}/revoke`, {
      method: "POST",
    }),

  accept: (token: string) =>
    apiFetch<InvitationOut>("/api/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
};
