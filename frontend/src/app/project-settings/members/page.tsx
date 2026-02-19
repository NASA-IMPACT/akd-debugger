"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invitationsApi } from "@/lib/api/invitations";
import { organizationsApi } from "@/lib/api/organizations";
import { projectsApi } from "@/lib/api/projects";
import { useWorkspace } from "@/providers/workspace-provider";

export default function MembersSettingsPage() {
  const queryClient = useQueryClient();
  const { organizationId, projectId } = useWorkspace();
  const [email, setEmail] = useState("");
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

  const addMutation = useMutation({
    mutationFn: async () => {
      if (projectId === null || organizationId === null) {
        throw new Error("Select organization and project first");
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        throw new Error("Enter a valid email");
      }

      const orgMember = normalizedEmailMap.get(normalizedEmail);
      if (orgMember) {
        if (projectMemberIds.has(orgMember.user_id)) {
          return {
            type: "already" as const,
            message: `${orgMember.user_full_name || orgMember.user_email || "User"} is already in this project.`,
          };
        }
        await projectsApi.addMember(projectId, orgMember.user_id);
        return {
          type: "added" as const,
          message: `${orgMember.user_full_name || orgMember.user_email || "User"} was added to this project.`,
        };
      }

      const invitation = await invitationsApi.create({
        email: normalizedEmail,
        project_assignments: [{ project_id: projectId }],
      });
      return {
        type: "invited" as const,
        message: "User is not in this organization yet. Invitation link generated.",
        inviteLink: invitation.invite_link || null,
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
                <button
                  onClick={() => removeMutation.mutate(m.user_id)}
                  className="text-sm text-red-500"
                  disabled={removeMutation.isPending}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
