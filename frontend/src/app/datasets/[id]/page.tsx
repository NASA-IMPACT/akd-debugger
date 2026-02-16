"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { suitesApi } from "@/lib/api/suites";
import { PageHeader } from "@/components/layout/page-header";
import { TagBadge } from "@/components/ui/tag-badge";
import { X, Upload, Pencil } from "lucide-react";
import { CsvImportModal } from "@/components/datasets/csv-import-modal";
import type { CsvColumnMapping } from "@/lib/types";

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const suiteId = parseInt(id);
  const queryClient = useQueryClient();

  const [importMsg, setImportMsg] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTags, setEditTags] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [qType, setQType] = useState("");
  const [qText, setQText] = useState("");
  const [qAnswer, setQAnswer] = useState("");
  const [qComments, setQComments] = useState("");

  const { data: suite, isLoading } = useQuery({
    queryKey: ["suite", suiteId],
    queryFn: () => suitesApi.get(suiteId),
  });

  const importCsvMutation = useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping: CsvColumnMapping }) =>
      suitesApi.importCsvMapped(suiteId, file, mapping),
    onSuccess: (data) => {
      setImportMsg(`Imported ${data.imported} queries`);
      setShowImportModal(false);
      queryClient.invalidateQueries({ queryKey: ["suite", suiteId] });
    },
    onError: (err: Error) => setImportMsg(err.message),
  });

  const addQueryMutation = useMutation({
    mutationFn: () =>
      suitesApi.addQuery(suiteId, {
        tag: qType || null,
        query_text: qText,
        expected_answer: qAnswer,
        comments: qComments || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", suiteId] });
      setAddModal(false);
      setQType("");
      setQText("");
      setQAnswer("");
      setQComments("");
    },
  });

  const updateSuiteMutation = useMutation({
    mutationFn: () =>
      suitesApi.update(suiteId, {
        name: editName,
        description: editDesc || null,
        tags: editTags ? editTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suite", suiteId] });
      setEditModal(false);
    },
  });

  const openEditModal = () => {
    if (!suite) return;
    setEditName(suite.name);
    setEditDesc(suite.description || "");
    setEditTags((suite.tags || []).join(", "));
    setEditModal(true);
  };

  const inputCls = "w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none transition-all bg-card border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50";

  if (isLoading || !suite) return <div className="text-center py-8 text-muted">Loading...</div>;

  const hasMetadata = (suite.queries || []).some((q) => q.metadata_ && Object.keys(q.metadata_).length > 0);

  return (
    <>
      <PageHeader
        title={suite.name}
        backHref="/datasets"
        titleAction={
          <button
            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
            onClick={openEditModal}
            title="Edit dataset"
            aria-label="Edit dataset"
          >
            <Pencil size={13} />
          </button>
        }
      >
        <div className="flex items-center gap-2">
          {(suite.tags || []).map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </div>
      </PageHeader>
      {suite.description && (
        <p className="text-muted text-sm mb-4 -mt-2">{suite.description}</p>
      )}

      {/* CSV Import */}
      <div className="bg-card rounded-lg border border-border p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Queries from CSV</h2>
            <p className="text-muted text-xs mt-0.5">Upload a CSV and map columns to query fields</p>
          </div>
          <button
            className="btn-subtle btn-subtle-primary"
            onClick={() => { setImportMsg(""); setShowImportModal(true); }}
          >
            <Upload size={16} />
            Import CSV
          </button>
        </div>
        {importMsg && <div className={`text-sm mt-2 ${importMsg.startsWith("Imported") ? "text-success" : "text-destructive"}`}>{importMsg}</div>}
      </div>

      {/* Queries table */}
      <div className="bg-card rounded-lg border border-border p-5 overflow-hidden">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-foreground">Queries ({suite.queries?.length || 0})</h2>
          <button className="btn-subtle btn-subtle-primary" onClick={() => setAddModal(true)}>+ Add Query</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-xs text-muted uppercase">#</th>
                <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-xs text-muted uppercase">Tag</th>
                <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-xs text-muted uppercase">Query</th>
                <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-xs text-muted uppercase">Expected Answer</th>
                <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-xs text-muted uppercase">Comments</th>
                {hasMetadata && <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-xs text-muted uppercase">Metadata</th>}
              </tr>
            </thead>
            <tbody>
              {(suite.queries || []).map((q) => (
                <tr key={q.id} className="border-b border-border last:border-b-0">
                  <td className="p-2 text-foreground">{q.ordinal}</td>
                  <td className="p-2">{q.tag && <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--tag-purple-bg)', color: 'var(--tag-purple-text)' }}>{q.tag}</span>}</td>
                  <td className="p-2 max-w-xs truncate text-foreground" title={q.query_text}>{q.query_text.substring(0, 100)}{q.query_text.length > 100 ? "..." : ""}</td>
                  <td className="p-2 max-w-xs truncate text-foreground" title={q.expected_answer}>{q.expected_answer.substring(0, 80)}{q.expected_answer.length > 80 ? "..." : ""}</td>
                  <td className="p-2 text-muted">{q.comments || ""}</td>
                  {hasMetadata && (
                    <td className="p-2 text-muted text-xs max-w-[200px]">
                      {q.metadata_ ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(q.metadata_).map(([k, v]) => (
                            <span key={k} className="inline-block px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-muted" title={`${k}: ${v}`}>
                              {k}: {String(v).substring(0, 20)}
                            </span>
                          ))}
                        </div>
                      ) : ""}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <CsvImportModal
          onClose={() => setShowImportModal(false)}
          onImport={(file, mapping) => importCsvMutation.mutate({ file, mapping })}
          isPending={importCsvMutation.isPending}
        />
      )}

      {/* Edit Dataset Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop" onClick={(e) => e.target === e.currentTarget && setEditModal(false)}>
          <div className="bg-card border border-border rounded-xl w-[90%] max-w-[500px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">Edit Dataset</h3>
              <button className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); updateSuiteMutation.mutate(); }}>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Name</label>
                <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Description</label>
                <textarea className={`${inputCls} resize-y`} rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Optional description" />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Tags</label>
                <input className={inputCls} value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="comma-separated, e.g. astro, physics" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" className="btn-subtle" onClick={() => setEditModal(false)}>Cancel</button>
                <button type="submit" className="btn-subtle btn-subtle-primary disabled:opacity-50" disabled={updateSuiteMutation.isPending}>
                  {updateSuiteMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Query Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAddModal(false)}>
          <div className="bg-card border border-border rounded-xl w-[90%] max-w-[500px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">Add Query</h3>
              <button className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors" onClick={() => setAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addQueryMutation.mutate(); }}>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Tag</label>
                <input className={inputCls} value={qType} onChange={(e) => setQType(e.target.value)} placeholder="e.g. archive_driven" />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Query Text</label>
                <textarea className={`${inputCls} resize-y`} rows={3} value={qText} onChange={(e) => setQText(e.target.value)} required />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Expected Answer</label>
                <textarea className={`${inputCls} resize-y`} rows={3} value={qAnswer} onChange={(e) => setQAnswer(e.target.value)} required />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">Comments</label>
                <input className={inputCls} value={qComments} onChange={(e) => setQComments(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" className="btn-subtle" onClick={() => setAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-subtle btn-subtle-primary disabled:opacity-50" disabled={addQueryMutation.isPending}>
                  {addQueryMutation.isPending ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
