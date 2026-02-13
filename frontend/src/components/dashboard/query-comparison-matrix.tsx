"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RunAnalyticsOut, QueryGradeRow, GradeValue } from "@/lib/types";
import { gradesApi } from "@/lib/api/grades";
import { GradeButton } from "@/components/grading/grade-button";
import { ReasoningDisplay } from "@/components/grading/reasoning-display";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ToolPills } from "@/components/tool-calls/tool-pills";
import { ToolModal } from "@/components/tool-calls/tool-modal";
import { countByKind } from "@/lib/tool-call-utils";
import { cn } from "@/lib/utils";
import type { ToolCall, ReasoningStep } from "@/lib/types";

type Filter = "all" | "disagreements";

interface Props {
  runs: RunAnalyticsOut[];
  queryGrades: QueryGradeRow[];
}

const gradeBadge: Record<string, { label: string; cls: string }> = {
  correct: { label: "Correct", cls: "bg-grade-correct-bg text-grade-correct-text" },
  partial: { label: "Partial", cls: "bg-grade-partial-bg text-grade-partial-text" },
  wrong: { label: "Wrong", cls: "bg-grade-wrong-bg text-grade-wrong-text" },
};

function isDisagreement(row: QueryGradeRow): boolean {
  const vals = Object.values(row.grades).filter(Boolean);
  return vals.length > 1 && new Set(vals).size > 1;
}

export function QueryComparisonMatrix({ runs, queryGrades }: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("disagreements");
  const [rows, setRows] = useState<QueryGradeRow[]>(queryGrades);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setRows(queryGrades);
  }, [queryGrades]);

  const selected = useMemo(
    () => rows.find((r) => r.query_id === selectedId) || null,
    [rows, selectedId]
  );

  const gradeMutation = useMutation({
    mutationFn: ({
      resultId,
      grade,
    }: {
      resultId: number;
      grade: GradeValue;
      runId: number;
      queryId: number;
    }) =>
      gradesApi.upsert(resultId, { grade }),
    onSuccess: (_, variables) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.query_id !== variables.queryId) return row;
          return {
            ...row,
            grades: {
              ...row.grades,
              [variables.runId]: variables.grade,
            },
          };
        })
      );
      queryClient.invalidateQueries({ queryKey: ["compare-analytics"] });
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "disagreements") return isDisagreement(row);
      return true;
    });
  }, [rows, filter]);

  if (!rows.length) return null;

  const disagreementCount = rows.filter(isDisagreement).length;
  const filters: { key: Filter; label: string }[] = [
    { key: "disagreements", label: "Disagreements" },
    { key: "all", label: "All" },
  ];

  return (
    <>
      <div className="bg-card rounded-xl p-6 px-8 mb-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">
          Query Comparison Matrix
        </h2>

        <div className="flex items-center gap-2 mb-3">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                filter === f.key
                  ? "bg-brand text-white"
                  : "bg-[var(--surface)] text-muted-foreground hover:bg-[var(--surface-hover)]"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            Showing {filtered.length} of {rows.length} queries
            {disagreementCount > 0 && (
              <>
                {" "}&middot; {disagreementCount} disagreement{disagreementCount !== 1 ? "s" : ""}
              </>
            )}
          </span>
        </div>

        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left p-2 bg-card font-semibold min-w-[220px]">Query</th>
                {runs.map((r) => (
                  <th key={r.run_id} className="text-center p-2 bg-card font-semibold whitespace-nowrap">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const disagree = isDisagreement(row);
                return (
                  <tr
                    key={row.query_id}
                    className={cn(
                      "border-b border-border cursor-pointer hover:bg-[var(--surface-hover)] transition-colors",
                      disagree && "border-l-2 border-l-amber-400"
                    )}
                    onClick={() => setSelectedId(row.query_id)}
                  >
                    <td className="p-2">
                      <span className="font-semibold text-muted-foreground mr-1.5">Q{row.ordinal}</span>
                      <span className="text-foreground">
                        {row.query_text.length > 90 ? `${row.query_text.slice(0, 90)}...` : row.query_text}
                      </span>
                      {row.tag && (
                        <span className="ml-2 text-xs text-muted-foreground bg-[var(--surface)] px-1.5 py-0.5 rounded">
                          {row.tag}
                        </span>
                      )}
                    </td>
                    {runs.map((r) => {
                      const grade = row.grades[r.run_id];
                      if (!grade) {
                        return (
                          <td key={r.run_id} className="p-2 text-center">
                            <span className="text-muted-foreground">-</span>
                          </td>
                        );
                      }
                      const badge = gradeBadge[grade];
                      return (
                        <td key={r.run_id} className="p-2 text-center">
                          <span className={`inline-flex items-center rounded-xl px-2 py-0.5 text-xs font-semibold ${badge?.cls ?? ""}`}>
                            {badge?.label ?? grade}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={1 + runs.length} className="text-center py-6 text-muted-foreground">
                    No queries match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <QueryCompareModal
          row={selected}
          runs={runs}
          onClose={() => setSelectedId(null)}
          onGrade={(runId, grade) => {
            const resultId = selected.result_ids?.[runId];
            if (!resultId) return;
            gradeMutation.mutate({ resultId, grade, runId, queryId: selected.query_id });
          }}
          gradePending={gradeMutation.isPending}
          onNavigate={(dir) => {
            const idx = filtered.findIndex((r) => r.query_id === selectedId);
            const next = idx + dir;
            if (next >= 0 && next < filtered.length) {
              setSelectedId(filtered[next].query_id);
            }
          }}
        />
      )}
    </>
  );
}

const dotColors: Record<string, string> = {
  correct: "bg-green-500",
  partial: "bg-yellow-400",
  wrong: "bg-red-500",
  not_graded: "bg-muted-light",
};

function RunPanel({
  run,
  row,
  editMode,
  setEditMode,
  onGrade,
  gradePending,
  onOpenToolModal,
}: {
  run: RunAnalyticsOut;
  row: QueryGradeRow;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  onGrade: (runId: number, grade: GradeValue) => void;
  gradePending: boolean;
  onOpenToolModal?: (toolCalls: ToolCall[], idx: number, runLabel: string) => void;
}) {
  const payload = row.responses?.[run.run_id];
  const activeGrade = row.grades[run.run_id] as GradeValue | undefined;
  const canGrade = Boolean(row.result_ids?.[run.run_id]);
  const tokens = payload?.usage?.total_tokens ? payload.usage.total_tokens.toLocaleString() : "N/A";
  const time = payload?.execution_time_seconds ? payload.execution_time_seconds.toFixed(1) + "s" : "N/A";
  const counts = countByKind(payload?.tool_calls as ToolCall[] | undefined);

  return (
    <div className="p-4 bg-[var(--surface)] border border-border rounded-b-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-muted">Agent Response</span>
        <label
          className={cn(
            "inline-flex items-center gap-2 text-xs",
            canGrade ? "text-foreground" : "text-muted"
          )}
          title={canGrade ? "Toggle grade controls" : "No result found for this run"}
        >
          <span>Edit grades</span>
          <button
            type="button"
            role="switch"
            aria-checked={editMode}
            onClick={() => canGrade && setEditMode(!editMode)}
            disabled={!canGrade}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              editMode ? "bg-brand" : "bg-border",
              !canGrade && "opacity-50 cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                editMode ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </label>
      </div>

      {editMode && canGrade && (
        <div className="flex gap-2 mb-3">
          {(["correct", "partial", "wrong"] as GradeValue[]).map((g) => (
            <GradeButton
              key={g}
              grade={g}
              active={activeGrade === g}
              onClick={() => onGrade(run.run_id, g)}
            />
          ))}
          {gradePending && <span className="text-xs text-muted self-center">Saving...</span>}
        </div>
      )}

      {payload?.error ? (
        <div className="text-destructive font-semibold mb-3">ERROR: {payload.error}</div>
      ) : null}
      <div className="bg-card border-2 border-border rounded-lg p-4 max-h-[360px] overflow-y-auto whitespace-pre-wrap text-sm">
        <MarkdownRenderer content={payload?.agent_response || "N/A"} />
      </div>

      {/* Stats */}
      <div className="mt-3 pt-3 border-t border-border text-sm text-muted flex gap-6 flex-wrap">
        <span><strong>Time:</strong> {time}</span>
        <span><strong>Tokens:</strong> {tokens}</span>
        {counts.tools > 0 && <span><strong>Tool Calls:</strong> {counts.tools}</span>}
        {counts.searches > 0 && <span><strong>Web Searches:</strong> {counts.searches}</span>}
        {counts.tools === 0 && counts.searches === 0 && <span><strong>Tool Calls:</strong> 0</span>}
      </div>

      {/* Tool pills */}
      <ToolPills
        toolCalls={(payload?.tool_calls as ToolCall[] | undefined) ?? null}
        onClickTool={(i) => onOpenToolModal?.(payload?.tool_calls as ToolCall[], i, run.label)}
      />

      {/* Reasoning */}
      <ReasoningDisplay reasoning={(payload?.reasoning as ReasoningStep[] | undefined) ?? null} />
    </div>
  );
}

function AgentDropdown({
  runs,
  row,
  selectedIdx,
  onChange,
}: {
  runs: RunAnalyticsOut[];
  row: QueryGradeRow;
  selectedIdx: number;
  onChange: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedRun = runs[selectedIdx];
  const selectedGrade = selectedRun ? (row.grades[selectedRun.run_id] || "not_graded") : "not_graded";

  return (
    <div ref={ref} className="relative mb-3">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-[var(--surface)] text-sm font-semibold hover:bg-[var(--surface-hover)] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColors[selectedGrade])} />
        <span className="truncate flex-1 text-left">{selectedRun?.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("shrink-0 transition-transform", open && "rotate-180")}>
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto">
          {runs.map((run, idx) => {
            const grade = row.grades[run.run_id] || "not_graded";
            return (
              <button
                key={run.run_id}
                type="button"
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--surface-hover)] transition-colors",
                  idx === selectedIdx && "bg-[var(--surface)] font-bold"
                )}
                onClick={() => { onChange(idx); setOpen(false); }}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColors[grade])} />
                <span className="truncate">{run.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SplitPanel({
  row,
  runs,
  initialLeft,
  initialRight,
  editMode,
  setEditMode,
  onGrade,
  gradePending,
  onOpenToolModal,
}: {
  row: QueryGradeRow;
  runs: RunAnalyticsOut[];
  initialLeft: number;
  initialRight: number;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  onGrade: (runId: number, grade: GradeValue) => void;
  gradePending: boolean;
  onOpenToolModal?: (toolCalls: ToolCall[], idx: number, runLabel: string) => void;
}) {
  const [leftIdx, setLeftIdx] = useState(initialLeft);
  const [rightIdx, setRightIdx] = useState(initialRight);

  return (
    <div className="flex divide-x divide-border border border-border rounded-b-lg bg-[var(--surface)]">
      <div className="flex-1 p-4 min-w-0">
        <AgentDropdown runs={runs} row={row} selectedIdx={leftIdx} onChange={setLeftIdx} />
        <RunPanel
          run={runs[leftIdx]}
          row={row}
          editMode={editMode}
          setEditMode={setEditMode}
          onGrade={onGrade}
          gradePending={gradePending}
          onOpenToolModal={onOpenToolModal}
        />
      </div>
      <div className="flex-1 p-4 min-w-0">
        <AgentDropdown runs={runs} row={row} selectedIdx={rightIdx} onChange={setRightIdx} />
        <RunPanel
          run={runs[rightIdx]}
          row={row}
          editMode={editMode}
          setEditMode={setEditMode}
          onGrade={onGrade}
          gradePending={gradePending}
          onOpenToolModal={onOpenToolModal}
        />
      </div>
    </div>
  );
}

function QueryCompareModal({
  row,
  runs,
  onClose,
  onGrade,
  gradePending,
  onNavigate,
}: {
  row: QueryGradeRow;
  runs: RunAnalyticsOut[];
  onClose: () => void;
  onGrade: (runId: number, grade: GradeValue) => void;
  gradePending: boolean;
  onNavigate: (direction: number) => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [splitView, setSplitView] = useState<{ left: number; right: number } | null>(null);
  const [toolModal, setToolModal] = useState<{ toolCalls: ToolCall[]; idx: number; runLabel: string } | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleOpenToolModal = (toolCalls: ToolCall[], idx: number, runLabel: string) => {
    setToolModal({ toolCalls, idx, runLabel });
  };

  // Reset tab when navigating to a different query
  useEffect(() => {
    setActiveTab(0);
    setSplitView(null);
    setToolModal(null);
  }, [row.query_id]);

  // Scroll active tab into view
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTab]);

  const handleTabClick = (e: React.MouseEvent, idx: number) => {
    if (e.shiftKey && runs.length > 1 && idx !== activeTab) {
      setSplitView({ left: activeTab, right: idx });
    } else {
      setActiveTab(idx);
      setSplitView(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && runs.length > 1) {
        e.preventDefault();
        setActiveTab((prev) =>
          e.shiftKey
            ? (prev - 1 + runs.length) % runs.length
            : (prev + 1) % runs.length
        );
      }
      if (e.key === "n") onNavigate(1);
      if (e.key === "p") onNavigate(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, runs.length, onNavigate]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-xl w-[95%] max-w-[1400px] h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-6 pb-0">
          <h3 className="text-xl font-semibold">Query #{row.ordinal}</h3>
          <button className="text-2xl text-muted hover:text-foreground" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="text-base p-3 bg-[var(--surface)] rounded-lg border-l-4 border-brand mb-4">
            <MarkdownRenderer content={row.query_text || ""} />
          </div>

          <div className="mb-4">
            <h4 className="text-muted text-sm font-semibold mb-2">Expected Answer</h4>
            <MarkdownRenderer content={row.expected_answer || ""} />
            {row.comments && (
              <div className="mt-2 px-3 py-1.5 bg-[var(--tag-orange-bg)] border-l-[3px] border-[var(--tag-orange-text)] rounded text-sm text-[var(--tag-orange-text)]">
                <strong>Note:</strong> {row.comments}
              </div>
            )}
          </div>

          <div className="flex bg-[var(--surface-hover)] border-b-2 border-border rounded-t-lg overflow-x-auto scrollbar-thin">
            {runs.map((run, idx) => {
              const grade = row.grades[run.run_id] || "";
              const badge = grade ? gradeBadge[grade] : null;
              return (
                <button
                  key={run.run_id}
                  ref={(el) => { tabRefs.current[idx] = el; }}
                  className={cn(
                    "px-4 py-2.5 font-semibold text-sm text-muted border-b-[3px] border-transparent -mb-[2px] whitespace-nowrap transition-colors flex-shrink-0",
                    idx === activeTab
                      ? "text-foreground bg-card border-b-brand"
                      : "hover:bg-[var(--surface)] hover:text-foreground"
                  )}
                  onClick={(e) => handleTabClick(e, idx)}
                >
                  {run.label}
                  {badge && (
                    <span className={`ml-2 inline-flex items-center rounded-xl px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {splitView ? (
            <SplitPanel
              row={row}
              runs={runs}
              initialLeft={splitView.left}
              initialRight={splitView.right}
              editMode={editMode}
              setEditMode={setEditMode}
              onGrade={onGrade}
              gradePending={gradePending}
              onOpenToolModal={handleOpenToolModal}
            />
          ) : (
            runs.map((run, idx) => {
              if (idx !== activeTab) return null;
              return (
                <RunPanel
                  key={run.run_id}
                  run={run}
                  row={row}
                  editMode={editMode}
                  setEditMode={setEditMode}
                  onGrade={onGrade}
                  gradePending={gradePending}
                  onOpenToolModal={handleOpenToolModal}
                />
              );
            })
          )}
        </div>

        {toolModal && (
          <ToolModal
            toolCalls={toolModal.toolCalls}
            initialIdx={toolModal.idx}
            queryLabel={`Q${row.ordinal}`}
            runLabel={toolModal.runLabel}
            onClose={() => setToolModal(null)}
          />
        )}
      </div>
    </div>
  );
}
