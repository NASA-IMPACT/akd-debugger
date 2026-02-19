"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTagFilter } from "@/providers/tag-filter-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { suitesApi } from "@/lib/api/suites";
import { PageHeader } from "@/components/layout/page-header";
import { TagBadge } from "@/components/ui/tag-badge";
import { formatDate } from "@/lib/utils";
import { Database, X, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function DatasetsPage() {
  const { tag } = useTagFilter();
  const { organizationId, projectId, workspaceReady } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagStr, setTagStr] = useState("");
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: number; name: string } | null>(null);

  const { data: suites = [], isLoading, isError, error } = useQuery({
    queryKey: ["suites", organizationId, projectId, tag],
    queryFn: () => suitesApi.list(tag || undefined),
    enabled: workspaceReady,
  });
  const showLoading = !workspaceReady || isLoading;

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description: description || null,
        tags: tagStr.split(",").map((t) => t.trim()).filter(Boolean),
      };
      return editId ? suitesApi.update(editId, body) : suitesApi.create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suites"] });
      setModal(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => suitesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suites"] });
      setDeleteModal(null);
    },
  });

  const openCreate = () => {
    setEditId(null);
    setName("");
    setDescription("");
    setTagStr("");
    setModal(true);
  };

  const openEdit = async (id: number) => {
    setMenuOpen(null);
    const s = await suitesApi.get(id);
    setEditId(id);
    setName(s.name);
    setDescription(s.description || "");
    setTagStr((s.tags || []).join(", "));
    setModal(true);
  };

  const inputCls = "w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none transition-all bg-card border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50";

  return (
    <>
      <PageHeader title="Datasets">
        <button className="btn-subtle btn-subtle-primary" onClick={openCreate}>
          + New Dataset
        </button>
      </PageHeader>

      {showLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-5">
              <div className="skeleton h-5 w-40 mb-2" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <p className="text-muted text-sm">
            Failed to load datasets: {(error as Error).message}
          </p>
        </div>
      ) : suites.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <Database size={40} className="mx-auto text-muted-light mb-3" />
          <p className="text-muted text-sm">No datasets found. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suites.map((s) => (
            <div
              key={s.id}
              className="bg-card rounded-lg border border-border p-5 flex justify-between items-center cursor-pointer hover:bg-[var(--surface-hover)] transition-colors group"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                router.push(`/datasets/${s.id}`);
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-foreground">{s.name}</strong>
                  <span className="text-muted text-sm">{s.query_count} queries</span>
                </div>
                <div className="flex gap-1 mt-1">
                  {(s.tags || []).map((t) => (
                    <TagBadge key={t} tag={t} />
                  ))}
                </div>
                <div className="text-muted-light text-xs mt-1">Created {formatDate(s.created_at)}</div>
              </div>
              <MoreMenu
                open={menuOpen === s.id}
                onToggle={() => setMenuOpen(menuOpen === s.id ? null : s.id)}
                onClose={() => setMenuOpen(null)}
                items={[
                  { label: "Edit", icon: <Pencil size={14} />, onClick: () => openEdit(s.id) },
                  { label: "Delete", icon: <Trash2 size={14} />, onClick: () => { setMenuOpen(null); setDeleteModal({ id: s.id, name: s.name }); }, destructive: true },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-card border border-border rounded-xl w-[90%] max-w-[500px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">{editId ? "Edit Dataset" : "New Dataset"}</h3>
              <button className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Name</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Description</label>
                <textarea className={`${inputCls} resize-y`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Tags (comma-separated)</label>
                <input className={inputCls} value={tagStr} onChange={(e) => setTagStr(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" className="btn-subtle" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn-subtle btn-subtle-primary disabled:opacity-50" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDeleteModal(null)}>
          <div className="bg-card border border-border rounded-xl w-[420px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-foreground">Delete Dataset</h3>
              <button className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setDeleteModal(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="mb-6 text-foreground">
              Delete <strong>{deleteModal.name}</strong> and all its queries? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-subtle" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn-subtle btn-subtle-danger"
                onClick={() => deleteMutation.mutate(deleteModal.id)}
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

/* ---------- Shared dropdown menu component ---------- */
interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

function MoreMenu({ open, onToggle, onClose, items }: { open: boolean; onToggle: () => void; onClose: () => void; items: MenuItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="p-1.5 rounded-lg text-muted-light opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-[var(--surface-hover)] transition-all duration-150"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-20 py-1 modal-content">
          {items.map((item) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                item.destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-[var(--surface-hover)]"
              }`}
              onClick={(e) => { e.stopPropagation(); item.onClick(); }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
