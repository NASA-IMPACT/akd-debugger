"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { notificationsApi } from "@/lib/api/notifications";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/lib/utils";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list({ limit: 100 }),
  });

  const readMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const deleteAllMutation = useMutation({
    mutationFn: () => notificationsApi.deleteAll(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setShowConfirm(false);
    },
  });

  return (
    <>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">Remove all notifications</h3>
            <p className="text-sm text-muted mt-2">This will permanently delete all notifications. This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-[var(--surface-hover)] transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteAllMutation.mutate()}
                disabled={deleteAllMutation.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteAllMutation.isPending ? "Removing..." : "Remove all"}
              </button>
            </div>
          </div>
        </div>
      )}
      <PageHeader title="Notifications" subtitle={<div className="text-sm text-muted mt-1">Background events from cost preview jobs</div>}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={deleteAllMutation.isPending || notifications.length === 0}
            className="text-sm text-muted hover:text-foreground disabled:opacity-50"
          >
            {deleteAllMutation.isPending ? "Removing..." : "Remove all notifications"}
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
          </button>
        </div>
      </PageHeader>
      <div className="bg-card rounded-xl border border-border shadow-sm">
        {isLoading ? (
          <div className="p-4 text-sm text-muted">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-sm text-muted">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <div key={n.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{n.title}</div>
                  <div className="text-sm text-muted mt-0.5">{n.message}</div>
                  <div className="text-xs text-muted-light mt-1">{formatDate(n.created_at)}</div>
                  {n.related_id && n.notif_type.startsWith("run_") && (
                    <Link className="text-xs text-brand mt-1 inline-block no-underline hover:underline" href={`/runs/${n.related_id}`}>
                      Open Run
                    </Link>
                  )}
                  {n.related_id && n.notif_type.includes("cost_preview") && (
                    <Link className="text-xs text-brand mt-1 inline-block no-underline hover:underline" href="/cost-previews">
                      Open Cost Previews
                    </Link>
                  )}
                </div>
                {!n.is_read && (
                  <button
                    className="px-3 py-1.5 bg-[var(--surface-hover)] border border-border rounded-lg text-xs font-semibold"
                    disabled={readMutation.isPending}
                    onClick={() => readMutation.mutate(n.id)}
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
