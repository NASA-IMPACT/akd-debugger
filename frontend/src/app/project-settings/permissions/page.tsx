"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { permissionsApi } from "@/lib/api/permissions";

export default function PermissionsSettingsPage() {
  const [userId, setUserId] = useState("");
  const [permissionId, setPermissionId] = useState("");
  const [effect, setEffect] = useState<"allow" | "deny">("allow");

  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: () => permissionsApi.list(),
  });

  const { data: grants = [], refetch: refetchGrants } = useQuery({
    queryKey: ["permission-grants"],
    queryFn: () => permissionsApi.listGrants(),
  });

  const createGrant = useMutation({
    mutationFn: () => permissionsApi.createGrant({
      user_id: Number(userId),
      permission_id: Number(permissionId),
      effect,
    }),
    onSuccess: async () => {
      setUserId("");
      setPermissionId("");
      await refetchGrants();
    },
  });

  const deleteGrant = useMutation({
    mutationFn: (grantId: number) => permissionsApi.deleteGrant(grantId),
    onSuccess: async () => {
      await refetchGrants();
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Permissions</h1>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Permission Catalog</h2>
        <div className="max-h-80 overflow-auto space-y-1 text-sm">
          {permissions.map((p) => <div key={p.id} className="clean-list-row px-3 py-2">#{p.id} · {p.key}</div>)}
        </div>
      </section>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">Create User Grant</h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input className="rounded-md border border-border px-3 py-1.5 bg-card" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" />
          <input className="rounded-md border border-border px-3 py-1.5 bg-card" value={permissionId} onChange={(e) => setPermissionId(e.target.value)} placeholder="Permission ID" />
          <select className="rounded-md border border-border px-3 py-1.5 bg-card" value={effect} onChange={(e) => setEffect(e.target.value as "allow" | "deny")}>
            <option value="allow">allow</option>
            <option value="deny">deny</option>
          </select>
          <button
            onClick={() => createGrant.mutate()}
            className="btn-subtle btn-subtle-primary md:justify-self-start"
            disabled={createGrant.isPending || userId.trim().length === 0 || permissionId.trim().length === 0}
          >
            {createGrant.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      <section className="clean-section">
        <h2 className="font-semibold mb-3">User Grants</h2>
        <div className="space-y-2">
          {grants.map((g) => (
            <div key={g.id} className="clean-list-row flex items-center justify-between px-3 py-2 text-sm">
              <div>Grant #{g.id}: user {g.user_id}, permission {g.permission_id}, {g.effect}</div>
              <button onClick={() => deleteGrant.mutate(g.id)} className="text-red-500">Delete</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
