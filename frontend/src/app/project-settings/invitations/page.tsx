"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invitationsApi } from "@/lib/api/invitations";
import { useWorkspace } from "@/providers/workspace-provider";

export default function InvitationsSettingsPage() {
  const queryClient = useQueryClient();
  const { projectId, projects } = useWorkspace();
  const [email, setEmail] = useState("");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [includeCurrentProject, setIncludeCurrentProject] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === projectId) ?? null;

  const { data: invitations = [], refetch } = useQuery({
    queryKey: ["invitations", projectId],
    queryFn: () => invitationsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      invitationsApi.create({
        email,
        project_assignments:
          includeCurrentProject && projectId
            ? [{ project_id: projectId }]
            : [],
      }),
    onSuccess: async (inv) => {
      setEmail("");
      setCreatedLink(inv.invite_link || null);
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
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeCurrentProject}
            onChange={(e) => setIncludeCurrentProject(e.target.checked)}
            className="rounded border-border"
          />
          Add to active project ({activeProject?.name ?? "none"}) on acceptance
        </label>
        {formError && <div className="mt-2 text-sm text-red-500">{formError}</div>}
        {createdLink && <div className="mt-3 text-xs break-all">Invite link: <a className="text-brand" href={createdLink}>{createdLink}</a></div>}
      </section>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Active Invitations</h2>
        <div className="space-y-2">
          {invitations.map((inv) => (
            <div key={inv.id} className="clean-list-row flex items-center justify-between px-3 py-2">
              <div className="text-sm">{inv.email} · {inv.accepted_at ? "accepted" : inv.revoked_at ? "revoked" : "pending"}</div>
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
