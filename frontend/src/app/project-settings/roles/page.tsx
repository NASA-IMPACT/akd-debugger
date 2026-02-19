"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { rolesApi } from "@/lib/api/roles";

export default function RolesSettingsPage() {
  const [orgRoleName, setOrgRoleName] = useState("");
  const [orgRoleSlug, setOrgRoleSlug] = useState("");
  const [projectRoleName, setProjectRoleName] = useState("");
  const [projectRoleSlug, setProjectRoleSlug] = useState("");

  const { data: orgRoles = [], refetch: refetchOrgRoles } = useQuery({
    queryKey: ["org-roles"],
    queryFn: () => rolesApi.listOrganization(),
  });
  const { data: projectRoles = [], refetch: refetchProjectRoles } = useQuery({
    queryKey: ["project-roles"],
    queryFn: () => rolesApi.listProject(),
  });

  const createOrgRole = useMutation({
    mutationFn: () => rolesApi.createOrganization(orgRoleName, orgRoleSlug),
    onSuccess: async () => {
      setOrgRoleName("");
      setOrgRoleSlug("");
      await refetchOrgRoles();
    },
  });

  const createProjectRole = useMutation({
    mutationFn: () => rolesApi.createProject(projectRoleName, projectRoleSlug),
    onSuccess: async () => {
      setProjectRoleName("");
      setProjectRoleSlug("");
      await refetchProjectRoles();
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Roles</h1>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Organization Roles</h2>
        <div className="space-y-2 mb-4">
          {orgRoles.map((role) => <div key={role.id} className="clean-list-row text-sm px-3 py-2">{role.name} ({role.slug})</div>)}
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input className="rounded-md border border-border px-3 py-1.5 bg-card" value={orgRoleName} onChange={(e) => setOrgRoleName(e.target.value)} placeholder="Name" />
          <input className="rounded-md border border-border px-3 py-1.5 bg-card" value={orgRoleSlug} onChange={(e) => setOrgRoleSlug(e.target.value)} placeholder="slug" />
          <button
            onClick={() => createOrgRole.mutate()}
            className="btn-subtle btn-subtle-primary md:justify-self-start"
            disabled={createOrgRole.isPending || orgRoleName.trim().length === 0 || orgRoleSlug.trim().length === 0}
          >
            {createOrgRole.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Project Roles</h2>
        <div className="space-y-2 mb-4">
          {projectRoles.map((role) => <div key={role.id} className="clean-list-row text-sm px-3 py-2">{role.name} ({role.slug})</div>)}
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input className="rounded-md border border-border px-3 py-1.5 bg-card" value={projectRoleName} onChange={(e) => setProjectRoleName(e.target.value)} placeholder="Name" />
          <input className="rounded-md border border-border px-3 py-1.5 bg-card" value={projectRoleSlug} onChange={(e) => setProjectRoleSlug(e.target.value)} placeholder="slug" />
          <button
            onClick={() => createProjectRole.mutate()}
            className="btn-subtle btn-subtle-primary md:justify-self-start"
            disabled={createProjectRole.isPending || projectRoleName.trim().length === 0 || projectRoleSlug.trim().length === 0}
          >
            {createProjectRole.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </section>
    </div>
  );
}
