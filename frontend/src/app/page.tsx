"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTagFilter } from "@/providers/tag-filter-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { runsApi } from "@/lib/api/runs";
import { suitesApi } from "@/lib/api/suites";
import { agentsApi } from "@/lib/api/agents";
import { browseApi } from "@/lib/api/browse";
import { comparisonsApi } from "@/lib/api/comparisons";
import { gradesApi } from "@/lib/api/grades";
import {
  parseCsvText,
  autoMatchGrade,
  type GradeColumnMapping,
  type ParsedCsv,
} from "@/components/grading/csv-grade-import-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { TagBadge } from "@/components/ui/tag-badge";
import { formatDate, cn } from "@/lib/utils";
import type { BrowseResult } from "@/lib/types";
import {
  Plus,
  Upload,
  Trash2,
  X,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  ArrowUp,
  GitCompareArrows,
  Inbox,
  ChevronDown,
} from "lucide-react";

export default function RunsPage() {
  const { tag } = useTagFilter();
  const { organizationId, projectId, workspaceReady } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importModal, setImportModal] = useState(false);
  const [browseModal, setBrowseModal] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    ids: number[];
    label?: string;
  } | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [datasetFilter, setDatasetFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [compareError, setCompareError] = useState("");

  // Import form state
  const [importLabel, setImportLabel] = useState("");
  const [importJsonDir, setImportJsonDir] = useState("");
  const [importSuiteId, setImportSuiteId] = useState("");
  const [importAgentId, setImportAgentId] = useState("");
  const [importTags, setImportTags] = useState("");
  const [importResult, setImportResult] = useState("");

  // Grade CSV import state (optional, inside import modal)
  const [importGradeFile, setImportGradeFile] = useState<File | null>(null);
  const [importGradeCsv, setImportGradeCsv] = useState<ParsedCsv | null>(null);
  const [importGradeMapping, setImportGradeMapping] =
    useState<GradeColumnMapping>({ query_text: "", grade: "", notes: null });
  const [gradeSection, setGradeSection] = useState(false);

  const {
    data: runs = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["runs", organizationId, projectId, tag],
    queryFn: () => runsApi.list(tag || undefined),
    enabled: workspaceReady,
  });

  const { data: suites = [] } = useQuery({
    queryKey: ["suites-list", organizationId, projectId],
    queryFn: () => suitesApi.list(),
    enabled: workspaceReady,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["agents-list", organizationId, projectId],
    queryFn: () => agentsApi.list(),
    enabled: workspaceReady,
  });
  const showLoading = !workspaceReady || isLoading;

  // Unique dataset/agent names from runs for filter dropdowns
  const datasetNames = useMemo(
    () => [...new Set(runs.map((r) => r.suite_name).filter(Boolean))].sort(),
    [runs],
  );
  const agentNames = useMemo(
    () => [...new Set(runs.map((r) => r.agent_name).filter(Boolean))].sort(),
    [runs],
  );

  // Filtered runs
  const filteredRuns = useMemo(() => {
    let result = runs;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (datasetFilter !== "all") {
      result = result.filter((r) => r.suite_name === datasetFilter);
    }
    if (agentFilter !== "all") {
      result = result.filter((r) => r.agent_name === agentFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => (r.label || "").toLowerCase().includes(q));
    }
    return result;
  }, [runs, statusFilter, datasetFilter, agentFilter, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async ({
      ids,
      deleteData,
    }: {
      ids: number[];
      deleteData: boolean;
    }) => {
      for (const id of ids) await runsApi.delete(id, deleteData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setDeleteModal(null);
      setSelected(new Set());
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const run = await runsApi.import({
        suite_id: parseInt(importSuiteId),
        agent_config_id: parseInt(importAgentId),
        label: importLabel,
        json_dir: importJsonDir,
        tags: importTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      let gradeResult = null;
      if (
        importGradeFile &&
        importGradeMapping.query_text &&
        importGradeMapping.grade
      ) {
        gradeResult = await gradesApi.importCsv(
          run.id,
          importGradeFile,
          importGradeMapping,
        );
      }
      return { run, gradeResult };
    },
    onSuccess: ({ run, gradeResult }) => {
      let msg = `Imported ${run.progress_current} results`;
      if (gradeResult) {
        msg += ` + ${gradeResult.imported} grades (${gradeResult.skipped} skipped)`;
      }
      setImportResult(msg);
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setTimeout(() => setImportModal(false), 1500);
    },
    onError: (err: Error) => setImportResult(err.message),
  });

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filteredRuns.length
        ? new Set()
        : new Set(filteredRuns.map((r) => r.id)),
    );
  }, [filteredRuns]);

  const openBrowser = useCallback(async () => {
    const data = await browseApi.list(importJsonDir || "~");
    setBrowseData(data);
    setBrowseModal(true);
  }, [importJsonDir]);

  const browseGo = useCallback(async (path: string) => {
    try {
      const data = await browseApi.list(path);
      setBrowseData(data);
    } catch {
      /* ignore */
    }
  }, []);

  const [comparing, setComparing] = useState(false);

  const handleCompare = async () => {
    setCompareError("");
    setComparing(true);
    try {
      const comparison = await comparisonsApi.create({
        run_ids: [...selected],
      });
      router.push(`/compare/${comparison.id}`);
    } catch (err: unknown) {
      setCompareError(
        err instanceof Error ? err.message : "Failed to create comparison",
      );
    } finally {
      setComparing(false);
    }
  };

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none transition-all bg-card border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50";
  const selectCls = inputCls;

  return (
    <>
      <PageHeader title="All Benchmarks">
        <button
          className="btn-subtle"
          onClick={() => {
            setImportResult("");
            setImportGradeFile(null);
            setImportGradeCsv(null);
            setImportGradeMapping({ query_text: "", grade: "", notes: null });
            setGradeSection(false);
            setImportModal(true);
          }}
        >
          <Upload size={15} />
          Import JSON
        </button>
        <Link
          href="/runs/new"
          className="btn-subtle btn-subtle-primary no-underline"
        >
          <Plus size={15} />
          New Run
        </Link>
      </PageHeader>

      {/* Loading skeleton */}
      {showLoading ? (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-4 px-4 border-b border-border last:border-b-0"
            >
              <div className="skeleton w-4 h-4 rounded" />
              <div className="skeleton h-4 w-44" />
              <div className="flex flex-col gap-1">
                <div className="skeleton h-3 w-28" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="skeleton h-4 w-20" />
              <div className="skeleton h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <p className="text-muted text-sm">
            Failed to load benchmarks: {(error as Error).message}
          </p>
        </div>
      ) : runs.length === 0 ? (
        /* Empty state */
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <Inbox size={40} className="mx-auto text-muted-light mb-3" />
          <p className="text-muted text-sm">
            No runs yet. Create a new run or import JSON results.
          </p>
        </div>
      ) : (
        /* Runs table in card */
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Search & Filter bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Search runs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-[13px] outline-none transition-all bg-[var(--surface-hover)] border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none min-w-[160px] pl-2.5 pr-9 py-1.5 rounded-md text-[13px] outline-none transition-all bg-[var(--surface-hover)] border border-border text-foreground cursor-pointer focus:ring-2 focus:ring-ring/30"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="running">Running</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="pending">Pending</option>
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-light pointer-events-none"
              />
            </div>
            {datasetNames.length > 0 && (
              <div className="relative">
                <select
                  value={datasetFilter}
                  onChange={(e) => setDatasetFilter(e.target.value)}
                  className="appearance-none min-w-[170px] pl-2.5 pr-9 py-1.5 rounded-md text-[13px] outline-none transition-all bg-[var(--surface-hover)] border border-border text-foreground cursor-pointer focus:ring-2 focus:ring-ring/30"
                >
                  <option value="all">All Datasets</option>
                  {datasetNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-light pointer-events-none"
                />
              </div>
            )}
            {agentNames.length > 0 && (
              <div className="relative">
                <select
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="appearance-none min-w-[170px] pl-2.5 pr-9 py-1.5 rounded-md text-[13px] outline-none transition-all bg-[var(--surface-hover)] border border-border text-foreground cursor-pointer focus:ring-2 focus:ring-ring/30"
                >
                  <option value="all">All Agents</option>
                  {agentNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-light pointer-events-none"
                />
              </div>
            )}
            {(searchQuery ||
              statusFilter !== "all" ||
              datasetFilter !== "all" ||
              agentFilter !== "all") && (
              <span className="text-xs text-muted-light">
                {filteredRuns.length} of {runs.length} runs
              </span>
            )}
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border/50">
                <th className="w-10 py-2.5 px-4">
                  <Checkbox
                    checked={
                      selected.size === filteredRuns.length &&
                      filteredRuns.length > 0
                    }
                    indeterminate={
                      selected.size > 0 && selected.size < filteredRuns.length
                    }
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-2.5 px-3 text-left text-muted-light text-[11px] font-medium uppercase tracking-wider">
                  Label
                </th>
                <th className="py-2.5 px-3 text-left text-muted-light text-[11px] font-medium uppercase tracking-wider">
                  Dataset / Agent
                </th>
                <th className="py-2.5 px-3 text-left text-muted-light text-[11px] font-medium uppercase tracking-wider">
                  Status
                </th>
                <th className="py-2.5 px-3 text-left text-muted-light text-[11px] font-medium uppercase tracking-wider">
                  Tags
                </th>
                <th className="py-2.5 px-3 text-left text-muted-light text-[11px] font-medium uppercase tracking-wider">
                  Created
                </th>
                <th className="w-10 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => {
                const elapsed =
                  run.completed_at && run.started_at
                    ? Math.round(
                        (new Date(run.completed_at).getTime() -
                          new Date(run.started_at).getTime()) /
                          1000 /
                          60,
                      ) + "m"
                    : "";
                const pct = run.progress_total
                  ? ((run.progress_current / run.progress_total) * 100).toFixed(
                      0,
                    )
                  : "0";
                return (
                  <tr
                    key={run.id}
                    className={cn(
                      "border-b border-border/50 last:border-b-0 hover:bg-[var(--surface-hover)] cursor-pointer transition-colors duration-100 group",
                      selected.has(run.id) && "bg-primary/5",
                    )}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      router.push(`/runs/${run.id}`);
                    }}
                  >
                    <td
                      className="py-3 px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.has(run.id)}
                        onChange={() => toggleSelect(run.id)}
                      />
                    </td>
                    <td className="py-3 px-3 font-medium text-foreground capitalize">
                      {run.label}
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-sm text-foreground leading-tight">
                        {run.suite_name || (
                          <span className="text-muted-light">&mdash;</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-light leading-tight mt-0.5">
                        {run.agent_name || ""}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={run.status} elapsed={elapsed} />
                      {run.status === "running" && (
                        <div className="flex items-center gap-2 mt-1 animate-progress-pulse">
                          <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-light">
                            {run.progress_current}/{run.progress_total}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(run.tags || []).map((t) => (
                          <TagBadge key={t} tag={t} />
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm text-muted">
                      {formatDate(run.created_at)}
                    </td>
                    <td
                      className="py-3 px-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="p-1.5 rounded-md text-muted-light opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                        onClick={() =>
                          setDeleteModal({ ids: [run.id], label: run.label })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRuns.length === 0 && runs.length > 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-muted text-sm"
                  >
                    No runs match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 float-up">
          {compareError && (
            <div className="mb-2 px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs font-medium text-center">
              {compareError}
            </div>
          )}
          <div className="glass rounded-lg px-4 py-2.5 shadow-[0_16px_64px_rgba(0,0,0,0.24)] flex items-center gap-4">
            <span className="text-sm font-medium text-foreground">
              {selected.size} selected
            </span>
            <div className="w-px h-5 bg-border" />
            <button
              onClick={handleCompare}
              disabled={selected.size < 2 || comparing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <GitCompareArrows size={15} />
              {comparing ? "Creating..." : "Compare"}
            </button>
            <button
              onClick={() => setDeleteModal({ ids: [...selected] })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={15} />
              Delete
            </button>
            <div className="w-px h-5 bg-border" />
            <button
              onClick={() => {
                setSelected(new Set());
                setCompareError("");
              }}
              className="p-1.5 rounded-md text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
              title="Deselect all"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setImportModal(false)}
        >
          <div className="bg-card border border-border rounded-xl w-[90%] max-w-[700px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-foreground">
                Import Run from JSON
              </h3>
              <button
                className="p-1.5 rounded-md text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setImportModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                importMutation.mutate();
              }}
            >
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">
                  Label
                </label>
                <input
                  className={inputCls}
                  value={importLabel}
                  onChange={(e) => setImportLabel(e.target.value)}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">
                  JSON Directory
                </label>
                <div className="flex gap-2">
                  <input
                    className={cn(inputCls, "flex-1")}
                    value={importJsonDir}
                    onChange={(e) => setImportJsonDir(e.target.value)}
                    required
                    placeholder="~/akd_data/run_0/json"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
                    onClick={openBrowser}
                  >
                    <FolderOpen size={15} />
                    Browse
                  </button>
                </div>
                <span className="text-xs text-muted-light mt-1 block">
                  Path to folder with 1.json, 2.json, ... files
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-medium text-sm text-muted mb-1.5">
                    Dataset
                  </label>
                  <select
                    className={selectCls}
                    value={importSuiteId}
                    onChange={(e) => setImportSuiteId(e.target.value)}
                    required
                  >
                    <option value="">Select...</option>
                    {suites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-sm text-muted mb-1.5">
                    Agent
                  </label>
                  <select
                    className={selectCls}
                    value={importAgentId}
                    onChange={(e) => setImportAgentId(e.target.value)}
                    required
                  >
                    <option value="">Select...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.model})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block font-medium text-sm text-muted mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  className={inputCls}
                  value={importTags}
                  onChange={(e) => setImportTags(e.target.value)}
                />
              </div>

              {/* Optional Grade CSV Import */}
              <div className="mb-4 border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted hover:bg-[var(--surface-hover)] transition-colors"
                  onClick={() => setGradeSection((v) => !v)}
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet size={15} />
                    Import Grades (optional)
                  </span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "transition-transform",
                      gradeSection && "rotate-180",
                    )}
                  />
                </button>
                {gradeSection && (
                  <div className="px-4 pb-4 pt-1 border-t border-border">
                    {!importGradeCsv ? (
                      <div>
                        <label className="block text-sm text-muted mb-1.5">
                          Grade CSV file
                        </label>
                        <input
                          type="file"
                          accept=".csv"
                          className="block w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-sm file:font-medium file:bg-card file:text-foreground hover:file:bg-[var(--surface-hover)] file:cursor-pointer file:transition-colors"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setImportGradeFile(f);
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const text = ev.target?.result as string;
                              const parsed = parseCsvText(text);
                              if (parsed.headers.length === 0) return;
                              setImportGradeCsv(parsed);
                              setImportGradeMapping(
                                autoMatchGrade(parsed.headers),
                              );
                            };
                            reader.readAsText(f);
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        {/* File info */}
                        <div className="flex items-center justify-between gap-3 mb-3 p-2.5 bg-[var(--surface-hover)] rounded-md">
                          <div className="flex items-center gap-2 text-sm min-w-0">
                            <FileSpreadsheet
                              size={16}
                              className="text-primary shrink-0"
                            />
                            <span className="font-medium text-foreground truncate">
                              {importGradeFile?.name}
                            </span>
                            <span className="text-muted shrink-0">
                              {importGradeCsv.totalRows} rows
                            </span>
                          </div>
                          <button
                            type="button"
                            className="p-1 rounded text-muted-light hover:text-foreground transition-colors shrink-0"
                            onClick={() => {
                              setImportGradeFile(null);
                              setImportGradeCsv(null);
                              setImportGradeMapping({
                                query_text: "",
                                grade: "",
                                notes: null,
                              });
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {/* Column mapping */}
                        <div className="space-y-2 mb-3">
                          {(
                            [
                              {
                                key: "query_text" as const,
                                label: "Query Text",
                                required: true,
                              },
                              {
                                key: "grade" as const,
                                label: "Grade",
                                required: true,
                              },
                              {
                                key: "notes" as const,
                                label: "Notes",
                                required: false,
                              },
                            ] as const
                          ).map(({ key, label, required }) => (
                            <div key={key} className="flex items-center gap-3">
                              <label className="w-28 text-sm font-medium text-foreground shrink-0">
                                {label}
                                {required && (
                                  <span className="text-destructive ml-0.5">
                                    *
                                  </span>
                                )}
                              </label>
                              <select
                                className={selectCls}
                                value={
                                  importGradeMapping[key] === null
                                    ? "— skip —"
                                    : importGradeMapping[key] || ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setImportGradeMapping((m) => ({
                                    ...m,
                                    [key]:
                                      val === "— skip —"
                                        ? null
                                        : val === ""
                                          ? required
                                            ? ""
                                            : null
                                          : val,
                                  }));
                                }}
                              >
                                {required ? (
                                  <option value="">Select column...</option>
                                ) : (
                                  <option value="— skip —">— skip —</option>
                                )}
                                {importGradeCsv.headers.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>

                        {/* Preview */}
                        {importGradeCsv.rows.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr>
                                  <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-muted uppercase">
                                    Query Text
                                  </th>
                                  <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-muted uppercase">
                                    Grade
                                  </th>
                                  <th className="text-left p-2 bg-[var(--surface-hover)] font-medium text-muted uppercase">
                                    Notes
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {importGradeCsv.rows
                                  .slice(0, 3)
                                  .map((row, i) => {
                                    const getVal = (col: string | null) => {
                                      if (!col) return "";
                                      const idx =
                                        importGradeCsv!.headers.indexOf(col);
                                      return idx >= 0 ? row[idx] || "" : "";
                                    };
                                    return (
                                      <tr
                                        key={i}
                                        className="border-t border-border"
                                      >
                                        <td className="p-2 text-foreground max-w-[200px] truncate">
                                          {getVal(
                                            importGradeMapping.query_text,
                                          )}
                                        </td>
                                        <td className="p-2 text-foreground">
                                          {getVal(importGradeMapping.grade)}
                                        </td>
                                        <td className="p-2 text-muted max-w-[150px] truncate">
                                          {getVal(importGradeMapping.notes)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {importResult && (
                <div
                  className={`text-sm mb-2 ${importResult.startsWith("Imported") ? "text-success" : "text-destructive"}`}
                >
                  {importResult}
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                  onClick={() => setImportModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-primary text-primary-foreground rounded-md font-medium text-[13px] hover:brightness-110 transition-colors"
                >
                  Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Browse Modal */}
      {browseModal && browseData && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setBrowseModal(false)}
        >
          <div className="bg-card border border-border rounded-xl w-[90%] max-w-[700px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-foreground">
                Select Folder
              </h3>
              <button
                className="p-1.5 rounded-md text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setBrowseModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                className="p-2 rounded-md bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => browseData.parent && browseGo(browseData.parent)}
              >
                <ArrowUp size={16} />
              </button>
              <input
                className={cn(inputCls, "flex-1 font-mono")}
                value={browseData.current}
                readOnly
              />
            </div>
            <div className="max-h-[350px] overflow-y-auto rounded-lg border border-border bg-[var(--surface)]">
              {browseData.items.length === 0 ? (
                <div className="p-8 text-center text-muted-light italic">
                  Empty folder
                </div>
              ) : (
                browseData.items.map((item) => (
                  <div
                    key={item.path}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 text-sm border-b border-border last:border-b-0 transition-colors",
                      item.type === "dir"
                        ? "cursor-pointer font-medium text-foreground hover:bg-[var(--surface-hover)]"
                        : "text-muted-light",
                    )}
                    onClick={() => item.type === "dir" && browseGo(item.path)}
                  >
                    {item.type === "dir" ? (
                      <FolderOpen size={16} className="text-primary shrink-0" />
                    ) : (
                      <FileText
                        size={16}
                        className="text-muted-light shrink-0"
                      />
                    )}
                    {item.name}
                  </div>
                ))
              )}
            </div>
            <div className="text-sm text-muted mt-2">
              {browseData.items.filter((i) => i.type === "dir").length}{" "}
              folder(s),{" "}
              {browseData.items.filter((i) => i.type === "file").length} .json
              file(s)
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                className="px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setBrowseModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-3.5 py-1.5 bg-primary text-primary-foreground rounded-md font-medium text-[13px] hover:brightness-110 transition-colors"
                onClick={() => {
                  setImportJsonDir(browseData.current);
                  setBrowseModal(false);
                }}
              >
                Select This Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setDeleteModal(null)}
        >
          <div className="bg-card border border-border rounded-xl w-[420px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-foreground">
                {deleteModal.ids.length === 1
                  ? "Delete Run"
                  : `Delete ${deleteModal.ids.length} Run(s)`}
              </h3>
              <button
                className="p-1.5 rounded-md text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setDeleteModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-foreground">
              {deleteModal.label ? (
                <>
                  Delete <strong>{deleteModal.label}</strong> from the database?
                </>
              ) : (
                <>
                  Delete <strong>{deleteModal.ids.length} run(s)</strong> and
                  their results?
                </>
              )}
            </p>
            <label className="flex items-center gap-2 p-3 rounded-md text-sm cursor-pointer bg-destructive/10 border border-destructive/20">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="accent-[var(--destructive)]"
              />
              <span className="text-destructive">
                Also delete output files from disk
              </span>
            </label>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                className="px-3.5 py-1.5 bg-destructive text-white rounded-md font-medium text-[13px] hover:brightness-110 transition-colors"
                onClick={() =>
                  deleteMutation.mutate({
                    ids: deleteModal.ids,
                    deleteData: deleteFiles,
                  })
                }
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
