"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invitationsApi } from "@/lib/api/invitations";
import { withCurrentOrigin } from "@/lib/invitation-links";
import { rolesApi } from "@/lib/api/roles";
import { useWorkspace } from "@/providers/workspace-provider";

export default function InvitationsSettingsPage() {
  const queryClient = useQueryClient();
  const { organizationId, projectId, projects } = useWorkspace();
  const [email, setEmail] = useState("");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [includeCurrentProject, setIncludeCurrentProject] = useState(true);
  const [orgRoleId, setOrgRoleId] = useState("");
  const [projectRoleId, setProjectRoleId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === projectId) ?? null;
  const { data: organizationRoles = [], error: organizationRolesError } = useQuery({
    queryKey: ["organization-roles-for-invitations", organizationId],
    queryFn: () => rolesApi.listOrganization(),
    enabled: organizationId !== null,
  });
  const { data: projectRoles = [], error: projectRolesError } = useQuery({
    queryKey: ["project-roles-for-invitations", organizationId],
    queryFn: () => rolesApi.listProject(),
    enabled: organizationId !== null,
  });

  const { data: invitations = [], refetch } = useQuery({
    queryKey: ["invitations", projectId],
    queryFn: () => invitationsApi.list(),
  });

  function selectedRoleIdOrNull(raw: string): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const selectedOrgRoleId = selectedRoleIdOrNull(orgRoleId);
      const selectedProjectRoleId = selectedRoleIdOrNull(projectRoleId);
      const projectAssignments =
        includeCurrentProject && projectId
          ? [
              selectedProjectRoleId === null
                ? { project_id: projectId }
                : { project_id: projectId, role_id: selectedProjectRoleId },
            ]
          : [];
      return invitationsApi.create({
        email,
        org_role_id: selectedOrgRoleId,
        project_assignments: projectAssignments,
      });
    },
    onSuccess: async (inv) => {
      setEmail("");
      setCreatedLink(withCurrentOrigin(inv.invite_link));
      setFormError(null);
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create invitation");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: number) => invitationsApi.revoke(invitationId),
    onSuccess: async () => {
      await refetch();
    },
  });
  const orgRoleNameById = new Map(organizationRoles.map((role) => [role.id, role.name]));
  const projectRoleNameById = new Map(projectRoles.map((role) => [role.id, role.name]));
  const orgRolesErrorMessage = organizationRolesError instanceof Error ? organizationRolesError.message : null;
  const projectRolesErrorMessage = projectRolesError instanceof Error ? projectRolesError.message : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Invitations</h1>
      <p className="text-sm text-muted">
        Active project: <span className="font-semibold text-foreground">{activeProject?.name ?? "None selected"}</span>
      </p>
      <section className="clean-section">
        <h2 className="font-semibold mb-3">Create Invite</h2>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border border-border px-3 py-2 bg-card" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
          <button
            onClick={() => createMutation.mutate()}
            className="btn-subtle btn-subtle-primary"
            disabled={createMutation.isPending || email.trim().length === 0}
          >
            {createMutation.isPending ? "Inviting..." : "Invite"}
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-2 mt-2">
          <label className="text-xs text-muted">
            Organization role
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={orgRoleId}
              onChange={(e) => setOrgRoleId(e.target.value)}
              disabled={createMutation.isPending}
            >
              <option value="">Default organization role (org_user)</option>
              {organizationRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {role.name} ({role.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Project role
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={projectRoleId}
              onChange={(e) => setProjectRoleId(e.target.value)}
              disabled={createMutation.isPending || !includeCurrentProject || projectId === null}
            >
              <option value="">Default project role (project_user)</option>
              {projectRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {role.name} ({role.slug})
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeCurrentProject}
            onChange={(e) => setIncludeCurrentProject(e.target.checked)}
            className="rounded border-border"
          />
          Add to active project ({activeProject?.name ?? "none"}) on acceptance
        </label>
        {orgRolesErrorMessage && <div className="mt-2 text-xs text-muted">Organization roles unavailable: {orgRolesErrorMessage}</div>}
        {projectRolesErrorMessage && <div className="mt-1 text-xs text-muted">Project roles unavailable: {projectRolesErrorMessage}</div>}
        {formError && <div className="mt-2 text-sm text-red-500">{formError}</div>}
        {createdLink && <div className="mt-3 text-xs break-all">Invite link: <a className="text-brand" href={createdLink}>{createdLink}</a></div>}
      </section>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Active Invitations</h2>
        <div className="space-y-2">
          {invitations.map((inv) => (
            <div key={inv.id} className="clean-list-row flex items-center justify-between px-3 py-2">
              <div className="text-sm">
                <div>{inv.email} · {inv.accepted_at ? "accepted" : inv.revoked_at ? "revoked" : "pending"}</div>
                <div className="text-xs text-muted">
                  Org role: {inv.org_role_id ? (orgRoleNameById.get(inv.org_role_id) || `Role #${inv.org_role_id}`) : "default"}
                  {inv.project_assignments.length > 0 && (
                    <> · Project role: {
                      inv.project_assignments[0]?.role_id
                        ? (projectRoleNameById.get(inv.project_assignments[0].role_id) || `Role #${inv.project_assignments[0].role_id}`)
                        : "default"
                    }</>
                  )}
                </div>
              </div>
              {!inv.accepted_at && !inv.revoked_at && (
                <button onClick={() => revokeMutation.mutate(inv.id)} className="text-sm text-red-500">Revoke</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
