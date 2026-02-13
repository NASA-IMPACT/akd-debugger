"use client";

import { useState, useEffect, useCallback } from "react";
import type { ResultOut, RunDetailOut, GradeValue, QueryOut } from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { GradeButton } from "./grade-button";
import { ReasoningDisplay } from "./reasoning-display";
import { ToolPills } from "@/components/tool-calls/tool-pills";
import { TraceComparePanel } from "@/components/tool-calls/trace-compare-panel";
import { AgentDropdown } from "./agent-dropdown";
import { countByKind } from "@/lib/tool-call-utils";
import { cn } from "@/lib/utils";

const borderColors: Record<string, string> = {
  correct: "border-grade-correct-border bg-grade-correct-bg",
  partial: "border-grade-partial-border bg-grade-partial-bg",
  wrong: "border-grade-wrong-border bg-grade-wrong-bg",
};

type ModalView = "responses" | "traces";

interface Props {
  queryId: number;
  query: QueryOut;
  runs: RunDetailOut[];
  resultsByRun: Record<number, ResultOut>;
  initialLeft: number;
  initialRight: number;
  onGrade: (resultId: number, grade: GradeValue, queryId: number, tabIdx: number) => void;
  onOpenToolModal: (resultId: number, idx: number, runLabel: string) => void;
  onClose: () => void;
}

function AgentPanel({
  run,
  result,
  tabIdx,
  queryId,
  onGrade,
  onOpenToolModal,
}: {
  run: RunDetailOut;
  result: ResultOut | undefined;
  tabIdx: number;
  queryId: number;
  onGrade: Props["onGrade"];
  onOpenToolModal: Props["onOpenToolModal"];
}) {
  if (!result) {
    return <div className="p-4 text-muted-light italic">No data for this query</div>;
  }

  const grade = result.grade?.grade || "";
  const tokens = result.usage?.total_tokens ? result.usage.total_tokens.toLocaleString() : "N/A";
  const time = result.execution_time_seconds ? result.execution_time_seconds.toFixed(1) + "s" : "N/A";
  const counts = countByKind(result.tool_calls);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Response */}
      <div
        className={cn(
          "bg-[var(--surface)] border-2 border-border rounded-lg p-4 mb-3 overflow-y-auto whitespace-pre-wrap text-sm flex-1 min-h-0",
          grade && borderColors[grade]
        )}
      >
        {result.error ? (
          <div className="text-destructive font-semibold">ERROR: {result.error}</div>
        ) : (
          <MarkdownRenderer content={result.agent_response || "N/A"} />
        )}
      </div>

      {/* Grade buttons */}
      <div className="flex gap-2 mt-1">
        {(["correct", "partial", "wrong"] as GradeValue[]).map((g) => (
          <GradeButton
            key={g}
            grade={g}
            active={grade === g}
            onClick={() => onGrade(result.id, g, queryId, tabIdx)}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="mt-3 pt-3 border-t border-border text-sm text-muted flex gap-6 flex-wrap">
        <span><strong>Time:</strong> {time}</span>
        <span><strong>Tokens:</strong> {tokens}</span>
        {counts.tools > 0 && <span><strong>Tool Calls:</strong> {counts.tools}</span>}
        {counts.searches > 0 && <span><strong>Web Searches:</strong> {counts.searches}</span>}
        {counts.tools === 0 && counts.searches === 0 && <span><strong>Tool Calls:</strong> 0</span>}
      </div>

      {/* Tool pills & reasoning */}
      <ToolPills
        toolCalls={result.tool_calls}
        onClickTool={(i) => onOpenToolModal(result.id, i, run.label)}
      />
      <ReasoningDisplay reasoning={result.reasoning} />
    </div>
  );
}

export function SplitCompareModal({
  queryId,
  query,
  runs,
  resultsByRun,
  initialLeft,
  initialRight,
  onGrade,
  onOpenToolModal,
  onClose,
}: Props) {
  const [leftIdx, setLeftIdx] = useState(initialLeft);
  const [rightIdx, setRightIdx] = useState(initialRight);
  const [view, setView] = useState<ModalView>("responses");

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const leftRun = runs[leftIdx];
  const rightRun = runs[rightIdx];
  const leftResult = leftRun ? resultsByRun[leftRun.id] : undefined;
  const rightResult = rightRun ? resultsByRun[rightRun.id] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl flex flex-col"
        style={{ width: "95vw", maxWidth: 1400, height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">
              Query #{query.ordinal || queryId}
              {query.tag && (
                <span className="ml-2 inline-block px-2 py-0.5 rounded-xl text-xs font-semibold bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]">
                  {query.tag}
                </span>
              )}
            </span>
            <div className="flex gap-0.5 bg-[var(--surface-hover)] border border-border rounded-md p-0.5 ml-2">
              <button
                type="button"
                className={cn(
                  "px-3 py-1 rounded text-xs font-semibold transition-colors",
                  view === "responses" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:text-foreground"
                )}
                onClick={() => setView("responses")}
              >
                Responses
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-1 rounded text-xs font-semibold transition-colors",
                  view === "traces" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:text-foreground"
                )}
                onClick={() => setView("traces")}
              >
                Traces
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        {view === "responses" ? (
          /* Two-column response body */
          <div className="flex flex-1 min-h-0 divide-x divide-border">
            {/* Left panel */}
            <div className="flex-1 flex flex-col min-w-0 p-4">
              <AgentDropdown
                runs={runs}
                resultsByRun={resultsByRun}
                selectedIdx={leftIdx}
                onChange={setLeftIdx}
              />
              <AgentPanel
                run={leftRun}
                result={leftResult}
                tabIdx={leftIdx}
                queryId={queryId}
                onGrade={onGrade}
                onOpenToolModal={onOpenToolModal}
              />
            </div>

            {/* Right panel */}
            <div className="flex-1 flex flex-col min-w-0 p-4">
              <AgentDropdown
                runs={runs}
                resultsByRun={resultsByRun}
                selectedIdx={rightIdx}
                onChange={setRightIdx}
              />
              <AgentPanel
                run={rightRun}
                result={rightResult}
                tabIdx={rightIdx}
                queryId={queryId}
                onGrade={onGrade}
                onOpenToolModal={onOpenToolModal}
              />
            </div>
          </div>
        ) : (
          /* Traces view */
          <div className="flex flex-col flex-1 min-h-0">
            {/* Agent dropdowns row */}
            <div className="flex divide-x divide-border shrink-0 border-b border-border">
              <div className="flex-1 px-4 pt-3">
                <AgentDropdown
                  runs={runs}
                  resultsByRun={resultsByRun}
                  selectedIdx={leftIdx}
                  onChange={setLeftIdx}
                />
              </div>
              <div className="flex-1 px-4 pt-3">
                <AgentDropdown
                  runs={runs}
                  resultsByRun={resultsByRun}
                  selectedIdx={rightIdx}
                  onChange={setRightIdx}
                />
              </div>
            </div>
            <TraceComparePanel
              left={{
                label: leftRun?.label ?? "Left",
                toolCalls: leftResult?.tool_calls ?? null,
                reasoning: leftResult?.reasoning ?? null,
              }}
              right={{
                label: rightRun?.label ?? "Right",
                toolCalls: rightResult?.tool_calls ?? null,
                reasoning: rightResult?.reasoning ?? null,
              }}
            />
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-2 border-t border-border text-xs text-muted shrink-0">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-border font-mono text-xs">Esc</kbd>
          <span className="ml-1.5">close</span>
        </div>
      </div>
    </div>
  );
}
