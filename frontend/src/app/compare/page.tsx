"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { comparisonsApi } from "@/lib/api/comparisons";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/lib/utils";
import { GitCompareArrows, Trash2, X, Inbox } from "lucide-react";

export default function CompareListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: comparisons = [], isLoading } = useQuery({
    queryKey: ["comparisons"],
    queryFn: () => comparisonsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => comparisonsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comparisons"] });
      setDeleteId(null);
    },
  });

  return (
    <>
      <PageHeader title="Comparisons" />

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-4 px-5 border-b border-border last:border-b-0">
              <div className="skeleton h-5 w-52" />
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : comparisons.length === 0 ? (
        <div className="bg-card rounded-xl border border-border shadow-sm py-20 text-center">
          <Inbox size={40} className="mx-auto text-muted-light mb-3" />
          <p className="text-muted text-sm">
            No saved comparisons yet. Select runs from the{" "}
            <a href="/" className="text-primary font-semibold no-underline hover:underline">Benchmarks</a>
            {" "}page and click &quot;Compare&quot; to create one.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[var(--surface-hover)] border-b border-border">
                <th className="py-2.5 px-5 text-left text-muted text-xs font-medium uppercase tracking-wider">Name</th>
                <th className="py-2.5 px-3 text-left text-muted text-xs font-medium uppercase tracking-wider">Dataset</th>
                <th className="py-2.5 px-3 text-left text-muted text-xs font-medium uppercase tracking-wider">Runs</th>
                <th className="py-2.5 px-3 text-left text-muted text-xs font-medium uppercase tracking-wider">Created</th>
                <th className="w-10 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-b-0 hover:bg-[var(--surface-hover)] cursor-pointer transition-colors duration-100 group"
                  onClick={() => router.push(`/compare/${c.id}`)}
                >
                  <td className="py-3 px-5 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <GitCompareArrows size={15} className="text-primary shrink-0" />
                      {c.name || `Comparison #${c.id}`}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-sm text-muted">{c.suite_name || "-"}</td>
                  <td className="py-3 px-3 text-sm text-muted">{c.run_count} runs</td>
                  <td className="py-3 px-3 text-sm text-muted">{formatDate(c.created_at)}</td>
                  <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1.5 rounded-lg text-muted-light opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDeleteId(null)}>
          <div className="bg-card border border-border rounded-2xl w-[420px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-foreground">Delete Comparison</h3>
              <button className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setDeleteId(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-foreground">
              Delete this comparison? The underlying runs and grades will not be affected.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="px-4 py-2 rounded-xl font-medium text-sm bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="px-4 py-2 bg-destructive text-white rounded-xl font-medium text-sm shadow-lg shadow-destructive/25 hover:brightness-110 hover:-translate-y-px transition-all"
                onClick={() => deleteMutation.mutate(deleteId)}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
