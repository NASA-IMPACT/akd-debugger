"use client";

import { useMemo } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useWorkspace } from "@/providers/workspace-provider";

export default function AccountSettingsPage() {
  const { user, organizations } = useAuth();
  const { organizationId, projectId, projects } = useWorkspace();

  const activeOrganization = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? null,
    [organizations, organizationId]
  );

  const activeProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Account</h1>
        <p className="text-sm text-muted mt-1">General user settings and workspace context.</p>
      </div>

      <section className="clean-section">
        <h2 className="text-sm font-semibold text-foreground mb-3">User Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted mb-1">Full Name</div>
            <div className="text-sm text-foreground">{user?.full_name ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Email</div>
            <div className="text-sm text-foreground">{user?.email ?? "-"}</div>
          </div>
        </div>
      </section>

      <section className="clean-section">
        <h2 className="text-sm font-semibold text-foreground mb-3">Active Workspace</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted mb-1">Organization</div>
            <div className="text-sm text-foreground">{activeOrganization?.name ?? "None selected"}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Project</div>
            <div className="text-sm text-foreground">{activeProject?.name ?? "None selected"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
