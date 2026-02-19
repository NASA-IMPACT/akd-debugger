"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { runsApi } from "@/lib/api/runs";
import { resultsApi } from "@/lib/api/results";
import { gradesApi } from "@/lib/api/grades";
import { useSSE } from "@/hooks/use-sse";
import { apiUrl } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";
import { GradingView } from "@/components/grading/grading-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { CompareDashboard } from "@/components/dashboard/compare-dashboard";
import { ConfigView } from "@/components/runs/config-view";
import { CsvGradeImportModal } from "@/components/grading/csv-grade-import-modal";

import { cn, formatElapsed } from "@/lib/utils";
import type { RunDetailOut, SSEProgressData } from "@/lib/types";

type Mode = "grading" | "dashboard" | "config";

interface LiveResult {
  runId: number;
  queryOrdinal: number;
  queryText: string;
  success: boolean;
  time?: number;
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const runId = parseInt(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("grading");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [rerunModal, setRerunModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [gradeImportModal, setGradeImportModal] = useState(false);

  // Rerun form
  const [rerunLabel, setRerunLabel] = useState("");
  const [rerunRepeat, setRerunRepeat] = useState("1");
  const [rerunBatch, setRerunBatch] = useState("10");
  const [rerunQueryIds, setRerunQueryIds] = useState<
    { id: number; ordinal: number; text: string; checked: boolean }[]
  >([]);

  // SSE state
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [progress, setProgress] = useState<
    Record<number, { current: number; total: number }>
  >({});
  const completedRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState("0m0s");

  // Fetch run data
  const { data: run, isLoading } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => runsApi.get(runId),
  });

  // Fetch group runs if applicable
  const { data: groupRuns = [] } = useQuery({
    queryKey: ["group", run?.run_group],
    queryFn: () =>
      run?.run_group ? runsApi.listGroup(run.run_group) : Promise.resolve([]),
    enabled: !!run?.run_group,
  });

  const allRunIds = groupRuns.length > 1 ? groupRuns.map((r) => r.id) : [runId];
  const isGroup = groupRuns.length > 1;
  const anyRunning =
    groupRuns.length > 0
      ? groupRuns.some((r) => r.status === "running" || r.status === "pending")
      : run?.status === "running" || run?.status === "pending";

  // SSE for each running run
  useEffect(() => {
    if (!anyRunning || allRunIds.length === 0) return;

    const sources: EventSource[] = [];
    completedRef.current = 0;
    startTimeRef.current = Date.now();

    allRunIds.forEach((rid) => {
      const es = new EventSource(apiUrl(`/api/runs/${rid}/stream`));
      sources.push(es);

      es.addEventListener("progress", (e) => {
        try {
          const d: SSEProgressData = JSON.parse(e.data);
          setProgress((prev) => ({
            ...prev,
            [rid]: { current: d.current, total: d.total },
          }));
          setLiveResults((prev) => [
            {
              runId: rid,
              queryOrdinal: d.query_ordinal,
              queryText: d.query_text,
              success: d.success,
              time: d.time,
            },
            ...prev,
          ]);
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("complete", () => {
        es.close();
        completedRef.current++;
        if (completedRef.current >= allRunIds.length) {
          queryClient.invalidateQueries({ queryKey: ["run", runId] });
          if (run?.run_group)
            queryClient.invalidateQueries({
              queryKey: ["group", run.run_group],
            });
        }
      });

      es.addEventListener("error", () => {
        es.close();
      });
    });

    return () => sources.forEach((es) => es.close());
  }, [anyRunning, allRunIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer
  useEffect(() => {
    if (!anyRunning) return;
    const iv = setInterval(
      () => setElapsed(formatElapsed(startTimeRef.current)),
      1000,
    );
    return () => clearInterval(iv);
  }, [anyRunning]);

  // Cancel run
  const cancelMutation = useMutation({
    mutationFn: async () => {
      for (const rid of allRunIds) await runsApi.cancel(rid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["run", runId] });
      if (run?.run_group)
        queryClient.invalidateQueries({ queryKey: ["group", run.run_group] });
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async () => {
      for (const rid of allRunIds) await runsApi.delete(rid, deleteFiles);
    },
    onSuccess: () => router.push("/"),
  });

  // Rerun
  const openRerun = useCallback(async () => {
    if (!run) return;
    setRerunLabel(`${run.label} (rerun)`);
    setRerunRepeat(String(isGroup ? groupRuns.length : 1));
    setRerunBatch(String(run.batch_size));
    // Load queries from results
    const results = await resultsApi.list(allRunIds[0]);
    const queryMap: Record<
      number,
      { id: number; ordinal: number; text: string }
    > = {};
    results.forEach((r) => {
      if (r.query)
        queryMap[r.query.id] = {
          id: r.query.id,
          ordinal: r.query.ordinal,
          text: r.query.query_text,
        };
    });
    setRerunQueryIds(
      Object.values(queryMap)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((q) => ({ ...q, checked: true })),
    );
    setRerunModal(true);
  }, [run, isGroup, groupRuns, allRunIds]);

  const rerunMutation = useMutation({
    mutationFn: async () => {
      const queryIds = rerunQueryIds.filter((q) => q.checked).map((q) => q.id);
      if (!queryIds.length) throw new Error("Select at least one query");
      const body = {
        suite_id: run!.suite_id,
        agent_config_id: run!.agent_config_id,
        label: rerunLabel,
        tags: run!.tags,
        batch_size: parseInt(rerunBatch),
        repeat: parseInt(rerunRepeat) || 1,
        query_ids: queryIds,
      };
      const cfg = await runsApi.getConfig(runId);
      if (cfg.agent?.executor_type === "openai_agents") {
        const preview = await runsApi.previewCost(body);
        if (preview.missing_model_pricing) {
          throw new Error(
            "Pricing missing for this model in data/openai_pricing.json",
          );
        }
        const ok = window.confirm(
          `Estimated total cost: $${preview.estimated_total_cost_usd.toFixed(6)} ${preview.currency}\n` +
            `Sampled query ordinals: ${preview.sampled_query_ordinals.join(", ")}\n` +
            `Approve and start rerun?`,
        );
        if (!ok) {
          throw new Error("Run cancelled by user");
        }
        return runsApi.approvePreviewAndStart(preview.id);
      }
      return runsApi.create(body);
    },
    onSuccess: (runs) => router.push(`/runs/${runs[0].id}`),
    onError: (err: Error) => {
      if (err.message === "Run cancelled by user") return;
      alert(err.message);
    },
  });

  // Grade CSV import
  const gradeImportMutation = useMutation({
    mutationFn: async ({
      file,
      mapping,
    }: {
      file: File;
      mapping: Record<string, string | null>;
    }) => {
      return gradesApi.importCsv(runId, file, mapping);
    },
    onSuccess: (data) => {
      setGradeImportModal(false);
      queryClient.invalidateQueries({ queryKey: ["results"] });
      alert(
        `Imported ${data.imported} grade(s), skipped ${data.skipped}.${data.errors.length ? `\nErrors:\n${data.errors.map((e) => `Row ${e.row}: ${e.reason}`).join("\n")}` : ""}`,
      );
    },
  });

  // Close actions menu on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handler = () => setActionsOpen(false);
    document.addEventListener("click", handler, { once: true });
    return () => document.removeEventListener("click", handler);
  }, [actionsOpen]);

  if (isLoading || !run)
    return <div className="text-center py-8 text-muted">Loading...</div>;

  const rerunCheckedCount = rerunQueryIds.filter((q) => q.checked).length;

  return (
    <>
      <PageHeader
        title={run.label}
        backHref="/"
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "font-semibold text-sm",
                run.status === "completed" && "text-[var(--tag-green-text)]",
                run.status === "running" && "text-brand",
                run.status === "failed" && "text-destructive",
              )}
            >
              {run.status}
            </span>
            <div className="flex gap-1">
              {(run.tags || []).map((t) => (
                <span
                  key={t}
                  className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        }
      >
        <div className="relative">
          <button
            className="w-8 h-8 text-xl text-muted hover:text-foreground rounded-lg hover:bg-[var(--surface-hover)] flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              setActionsOpen(!actionsOpen);
            }}
          >
            &#8943;
          </button>
          {actionsOpen && (
            <div className="absolute right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden min-w-[140px]">
              <button
                className="block w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-hover)]"
                onClick={() => {
                  setActionsOpen(false);
                  openRerun();
                }}
              >
                &#8635; Rerun
              </button>
              <button
                className="block w-full text-left px-4 py-2 text-sm text-destructive hover:bg-[var(--surface-hover)]"
                onClick={() => {
                  setActionsOpen(false);
                  setDeleteModal(true);
                }}
              >
                &#10005; Delete
              </button>
            </div>
          )}
        </div>
      </PageHeader>

      <div className="text-sm text-muted mb-4">
        <span>
          <strong>Agent:</strong>{" "}
          <a
            href={`/agents/${run.agent_config_id}`}
            target="_blank"
            className="text-brand hover:underline"
          >
            {run.agent_name}
          </a>
        </span>
        <span className="mx-3">|</span>
        <span>
          <strong>Dataset:</strong>{" "}
          <a
            href={`/datasets/${run.suite_id}`}
            target="_blank"
            className="text-brand hover:underline"
          >
            {run.suite_name}
          </a>
        </span>
      </div>

      {anyRunning ? (
        /* ── Live progress mode ── */
        <div>
          {isGroup ? (
            <div className="mb-4">
              <h3 className="font-semibold mb-3">
                Group Progress ({groupRuns.length} runs)
              </h3>
              {groupRuns.map((gr) => {
                const p = progress[gr.id] || {
                  current: gr.progress_current,
                  total: gr.progress_total,
                };
                const pct = p.total
                  ? ((p.current / p.total) * 100).toFixed(0)
                  : "0";
                return (
                  <div key={gr.id} className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm">
                        <strong>{gr.label}</strong>{" "}
                        <span
                          className={cn(
                            "font-semibold",
                            gr.status === "running" && "text-brand",
                          )}
                        >
                          {gr.status}
                        </span>
                      </span>
                      <span className="text-xs text-muted">
                        {p.current}/{p.total}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-border rounded-full">
                      <div
                        className="h-full bg-brand rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm">
                  Progress:{" "}
                  <strong>
                    {progress[runId]?.current ?? run.progress_current}/
                    {progress[runId]?.total ?? run.progress_total}
                  </strong>
                </span>
                <span className="text-xs text-muted">elapsed: {elapsed}</span>
              </div>
              <div className="w-full h-3 bg-border rounded-full">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{
                    width: `${run.progress_total ? (((progress[runId]?.current ?? run.progress_current) / run.progress_total) * 100).toFixed(0) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          <h3 className="font-semibold mb-2 mt-6">Live Results</h3>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {liveResults.map((lr, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
                  lr.success
                    ? "bg-[var(--tag-green-bg)]"
                    : "bg-[var(--tag-orange-bg)]",
                )}
              >
                <span>
                  {isGroup ? `[Run ${allRunIds.indexOf(lr.runId) + 1}] ` : ""}Q
                  {lr.queryOrdinal} {lr.success ? "\u2713" : "\u2717"}{" "}
                  {lr.time ? `${lr.time.toFixed(1)}s` : ""}
                </span>
                <span className="text-muted truncate">{lr.queryText}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <button
              className="btn-subtle btn-subtle-danger"
              onClick={() => {
                if (confirm("Cancel this run?")) cancelMutation.mutate();
              }}
            >
              Cancel Run
            </button>
          </div>
        </div>
      ) : (
        /* ── Completed mode: grading / dashboard / config ── */
        <>
          <div className="flex gap-1 mb-4 bg-[var(--surface-hover)] rounded-lg p-1 w-fit">
            {(["grading", "dashboard", "config"] as Mode[]).map((m) => (
              <button
                key={m}
                className={cn("btn-subtle", mode === m && "btn-subtle-primary")}
                onClick={() => setMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {mode === "grading" &&
            (isGroup ? (
              <GradingView runIds={allRunIds} compare />
            ) : (
              <GradingView runId={runId} />
            ))}
          {mode === "dashboard" &&
            (isGroup ? (
              <CompareDashboard runIds={allRunIds} />
            ) : (
              <DashboardView runId={runId} />
            ))}
          {mode === "config" && <ConfigView runIds={allRunIds} />}
        </>
      )}

      {/* Rerun Modal */}
      {rerunModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setRerunModal(false)}
        >
          <div className="bg-card rounded-lg w-[90%] max-w-[550px] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 pb-0">
              <h3 className="text-lg font-semibold">Rerun</h3>
              <button
                className="text-2xl text-muted hover:text-foreground"
                onClick={() => setRerunModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <label className="block font-semibold text-sm text-muted mb-1">
                  Label
                </label>
                <input
                  className="w-full px-2.5 py-1.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:border-brand outline-none"
                  value={rerunLabel}
                  onChange={(e) => setRerunLabel(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-semibold text-sm text-muted mb-1">
                    Repeat
                  </label>
                  <input
                    type="number"
                    className="w-full px-2.5 py-1.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:border-brand outline-none"
                    value={rerunRepeat}
                    onChange={(e) => setRerunRepeat(e.target.value)}
                    min={1}
                    max={10}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-sm text-muted mb-1">
                    Batch Size
                  </label>
                  <select
                    className="w-full px-2.5 py-1.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:border-brand outline-none"
                    value={rerunBatch}
                    onChange={(e) => setRerunBatch(e.target.value)}
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-sm text-muted mb-1">
                  Queries{" "}
                  <span className="text-muted-light font-normal">
                    ({rerunCheckedCount} selected)
                  </span>
                </label>
                <div className="max-h-[250px] overflow-y-auto border border-border rounded-lg p-2 bg-[var(--surface)] space-y-0.5">
                  {rerunQueryIds.map((q) => (
                    <label
                      key={q.id}
                      className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={q.checked}
                        onChange={() =>
                          setRerunQueryIds((prev) =>
                            prev.map((p) =>
                              p.id === q.id ? { ...p, checked: !p.checked } : p,
                            ),
                          )
                        }
                      />
                      <span className="font-semibold text-muted shrink-0">
                        Q{q.ordinal}
                      </span>
                      <span className="truncate">
                        {q.text.length > 80
                          ? q.text.substring(0, 80) + "..."
                          : q.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0 border-t border-border mt-auto">
              <button
                className="btn-subtle"
                onClick={() => setRerunModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-subtle btn-subtle-primary disabled:opacity-50"
                onClick={() => rerunMutation.mutate()}
                disabled={rerunMutation.isPending}
              >
                {rerunMutation.isPending ? "Starting..." : "Start Rerun"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grade Import Modal */}
      {gradeImportModal && (
        <CsvGradeImportModal
          onClose={() => setGradeImportModal(false)}
          onImport={(file, mapping) =>
            gradeImportMutation.mutate({ file, mapping })
          }
          isPending={gradeImportMutation.isPending}
        />
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setDeleteModal(false)}
        >
          <div className="bg-card rounded-lg w-[420px] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Delete Run</h3>
              <button
                className="text-2xl text-muted hover:text-foreground"
                onClick={() => setDeleteModal(false)}
              >
                &times;
              </button>
            </div>
            <p className="mb-4">
              {isGroup ? (
                <>
                  This will delete <strong>all {groupRuns.length} runs</strong>{" "}
                  in this group.
                </>
              ) : (
                "This will delete this run and its results."
              )}
            </p>
            <label className="flex items-center gap-2 p-2 bg-[var(--tag-orange-bg)] border border-[var(--tag-orange-text)]/20 rounded-md text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
              />
              <span className="text-destructive">
                Also delete output files from disk
              </span>
            </label>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="btn-subtle"
                onClick={() => setDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-subtle btn-subtle-danger disabled:opacity-50"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
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
