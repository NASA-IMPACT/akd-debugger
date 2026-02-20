"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invitationsApi } from "@/lib/api/invitations";
import { withCurrentOrigin } from "@/lib/invitation-links";
import { organizationsApi } from "@/lib/api/organizations";
import { projectsApi } from "@/lib/api/projects";
import { rolesApi } from "@/lib/api/roles";
import { formatRoleNameForViewer, formatRoleSlugForViewer } from "@/lib/existential-mode";
import { useAuth } from "@/providers/auth-provider";
import { useWorkspace } from "@/providers/workspace-provider";

export default function MembersSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { organizationId, projectId } = useWorkspace();
  const [email, setEmail] = useState("");
  const [inviteOrgRoleId, setInviteOrgRoleId] = useState("");
  const [projectRoleId, setProjectRoleId] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    data: projectMembers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => projectsApi.listMembers(projectId as number),
    enabled: projectId !== null,
  });

  const {
    data: organizationMembers = [],
  } = useQuery({
    queryKey: ["organization-members-for-project-members", organizationId],
    queryFn: () => organizationsApi.listMembers({ organizationId }),
    enabled: organizationId !== null,
  });
  const {
    data: organizationRoles = [],
    error: organizationRolesError,
  } = useQuery({
    queryKey: ["organization-roles-for-project-members", organizationId],
    queryFn: () => rolesApi.listOrganization(),
    enabled: organizationId !== null,
  });
  const {
    data: projectRoles = [],
    error: projectRolesError,
  } = useQuery({
    queryKey: ["project-roles-for-project-members", organizationId],
    queryFn: () => rolesApi.listProject(),
    enabled: organizationId !== null,
  });

  const projectMemberIds = useMemo(
    () => new Set(projectMembers.map((m) => m.user_id)),
    [projectMembers]
  );
  const normalizedEmailMap = useMemo(() => {
    const byEmail = new Map<string, (typeof organizationMembers)[number]>();
    organizationMembers.forEach((member) => {
      const value = member.user_email?.trim().toLowerCase();
      if (value) byEmail.set(value, member);
    });
    return byEmail;
  }, [organizationMembers]);
  const projectRoleNameById = useMemo(
    () => new Map(projectRoles.map((role) => [role.id, formatRoleNameForViewer(role.name, user?.email)])),
    [projectRoles, user?.email]
  );

  function selectedRoleIdOrNull(raw: string): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (projectId === null || organizationId === null) {
        throw new Error("Select organization and project first");
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        throw new Error("Enter a valid email");
      }
      const selectedProjectRoleId = selectedRoleIdOrNull(projectRoleId);
      const selectedOrgRoleId = selectedRoleIdOrNull(inviteOrgRoleId);

      const orgMember = normalizedEmailMap.get(normalizedEmail);
      if (orgMember) {
        if (projectMemberIds.has(orgMember.user_id)) {
          return {
            type: "already" as const,
            message: `${orgMember.user_full_name || orgMember.user_email || "User"} is already in this project.`,
          };
        }
        await projectsApi.addMember(projectId, orgMember.user_id, selectedProjectRoleId);
        return {
          type: "added" as const,
          message: `${orgMember.user_full_name || orgMember.user_email || "User"} was added to this project.`,
        };
      }

      const assignment =
        selectedProjectRoleId === null
          ? { project_id: projectId }
          : { project_id: projectId, role_id: selectedProjectRoleId };
      const invitation = await invitationsApi.create({
        email: normalizedEmail,
        org_role_id: selectedOrgRoleId,
        project_assignments: [assignment],
      });
      return {
        type: "invited" as const,
        message: "User is not in this organization yet. Invitation link generated.",
        inviteLink: withCurrentOrigin(invitation.invite_link),
      };
    },
    onSuccess: async (result) => {
      setFormError(null);
      setFormMessage(result.message);
      setInviteLink(result.type === "invited" ? result.inviteLink : null);
      if (result.type === "added") {
        await queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      }
      if (result.type !== "already") {
        setEmail("");
      }
    },
    onError: (err) => {
      setFormMessage(null);
      setInviteLink(null);
      setFormError(err instanceof Error ? err.message : "Failed to add member");
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number | null }) =>
      projectsApi.updateMemberRole(projectId as number, userId, roleId),
    onSuccess: async () => {
      setFormError(null);
      setFormMessage("Member role updated.");
      await queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update member role");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (uid: number) => projectsApi.removeMember(projectId as number, uid),
    onSuccess: async () => {
      setFormError(null);
      setFormMessage(null);
      setInviteLink(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
  });

  const queryError = error instanceof Error ? error.message : null;
  const orgRolesErrorMessage = organizationRolesError instanceof Error ? organizationRolesError.message : null;
  const projectRolesErrorMessage = projectRolesError instanceof Error ? projectRolesError.message : null;
  const roleSaveUserId = updateRoleMutation.variables?.userId ?? null;

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setFormError(null);
      setFormMessage("Invite link copied.");
    } catch {
      setFormError("Could not copy invite link.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Project Members</h1>
      </div>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Add Member by Email</h2>
        <p className="text-xs text-muted mb-2">
          If the email is already in this organization, the user is added directly. If not, an invite link is generated for this organization and this project.
        </p>
        <div className="grid gap-2 md:grid-cols-2 mb-2">
          <label className="text-xs text-muted">
            Organization role for invited users
            <select
              className="mt-1 w-full rounded-md border border-border px-3 py-2 bg-card text-sm"
              value={inviteOrgRoleId}
              onChange={(e) => setInviteOrgRoleId(e.target.value)}
              disabled={projectId === null || addMutation.isPending}
            >
              <option value="">Default organization role (org_user)</option>
              {organizationRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {formatRoleNameForViewer(role.name, user?.email)} ({formatRoleSlugForViewer(role.slug, user?.email)})
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
              disabled={projectId === null || addMutation.isPending}
            >
              <option value="">Default project role (project_user)</option>
              {projectRoles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {formatRoleNameForViewer(role.name, user?.email)} ({formatRoleSlugForViewer(role.slug, user?.email)})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-border px-3 py-2 bg-card"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@company.com"
            disabled={projectId === null || addMutation.isPending}
          />
          <button
            onClick={() => addMutation.mutate()}
            disabled={projectId === null || email.trim().length === 0 || addMutation.isPending}
            className="btn-subtle btn-subtle-primary"
          >
            {addMutation.isPending ? "Processing..." : "Add / Invite"}
          </button>
        </div>
        {orgRolesErrorMessage && <div className="mt-2 text-xs text-muted">Organization roles unavailable: {orgRolesErrorMessage}</div>}
        {projectRolesErrorMessage && <div className="mt-1 text-xs text-muted">Project roles unavailable: {projectRolesErrorMessage}</div>}
        {formMessage && <div className="mt-2 text-sm text-muted">{formMessage}</div>}
        {formError && <div className="mt-2 text-sm text-red-500">{formError}</div>}
        {inviteLink && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Invite link:</span>
            <a className="text-brand break-all min-w-0 flex-1" href={inviteLink}>
              {inviteLink}
            </a>
            <button type="button" className="btn-subtle text-xs" onClick={() => void copyInviteLink()}>
              Copy
            </button>
          </div>
        )}
      </section>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Members</h2>
        {projectId === null ? (
          <div className="text-sm text-muted">Select a project first.</div>
        ) : isLoading ? (
          <div className="text-sm text-muted">Loading members...</div>
        ) : queryError ? (
          <div className="text-sm text-red-500">{queryError}</div>
        ) : projectMembers.length === 0 ? (
          <div className="text-sm text-muted">No members yet.</div>
        ) : (
          <div className="space-y-2">
            {projectMembers.map((m) => (
              <div key={m.id} className="clean-list-row flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{m.user_full_name || "Unnamed user"}</div>
                  <div className="text-xs text-muted truncate">{m.user_email || `User #${m.user_id}`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border border-border px-2 py-1 bg-card text-xs"
                    value={m.role_id ? String(m.role_id) : ""}
                    disabled={updateRoleMutation.isPending || projectRoles.length === 0}
                    onChange={(e) =>
                      updateRoleMutation.mutate({
                        userId: m.user_id,
                        roleId: selectedRoleIdOrNull(e.target.value),
                      })
                    }
                  >
                    <option value="">Default project role (project_user)</option>
                    {projectRoles.map((role) => (
                      <option key={role.id} value={String(role.id)}>
                        {formatRoleNameForViewer(role.name, user?.email)}
                      </option>
                    ))}
                  </select>
                  {roleSaveUserId === m.user_id && updateRoleMutation.isPending ? (
                    <div className="text-xs text-muted">Saving...</div>
                  ) : (
                    <div className="text-xs text-muted">
                      {m.role_id ? projectRoleNameById.get(m.role_id) || `Role #${m.role_id}` : "Default role"}
                    </div>
                  )}
                  <button
                    onClick={() => removeMutation.mutate(m.user_id)}
                    className="text-sm text-red-500"
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
