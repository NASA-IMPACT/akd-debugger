"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ResultOut,
  RunDetailOut,
  GradeValue,
  QueryOut,
} from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { GradeButton } from "./grade-button";
import { countByKind } from "@/lib/tool-call-utils";
import { cn } from "@/lib/utils";
import { SplitCompareModal } from "./split-compare-modal";
import { RotateCcw, Copy, Check } from "lucide-react";

interface Props {
  queryId: number;
  query: QueryOut;
  runs: RunDetailOut[];
  resultsByRun: Record<number, ResultOut>;
  versionsByResultId: Record<number, ResultOut[]>;
  onGrade: (
    resultId: number,
    grade: GradeValue,
    queryId: number,
    tabIdx: number,
  ) => void;
  onOpenToolModal: (resultId: number, idx: number, runLabel: string) => void;
  onRetry: (resultId: number) => void;
  onAcceptVersion: (resultId: number, versionId: number) => void;
  onIgnoreVersion: (resultId: number, versionId: number) => void;
  isActive?: boolean;
  isRetrying?: boolean;
}

const borderColors: Record<string, string> = {
  correct: "border-grade-correct-border bg-grade-correct-bg",
  partial: "border-grade-partial-border bg-grade-partial-bg",
  wrong: "border-grade-wrong-border bg-grade-wrong-bg",
};

const dotColors: Record<string, string> = {
  correct: "bg-green-500",
  partial: "bg-yellow-400",
  wrong: "bg-red-500",
  not_graded: "bg-muted-light",
};

export function CompareCard({
  queryId,
  query,
  runs,
  resultsByRun,
  versionsByResultId,
  onGrade,
  onOpenToolModal,
  onRetry,
  onAcceptVersion,
  onIgnoreVersion,
  isActive,
  isRetrying = false,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [tabsMinimized, setTabsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [splitCompare, setSplitCompare] = useState<{
    left: number;
    right: number;
  } | null>(null);
  const [selectedVersionByRun, setSelectedVersionByRun] = useState<
    Record<number, number>
  >({});
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const defaultVersionByRun = useMemo(() => {
    const next: Record<number, number> = {};
    runs.forEach((run) => {
      const base = resultsByRun[run.id];
      if (!base) return;
      const versions = versionsByResultId[base.id] || [base];
      next[run.id] = versions.find((v) => v.is_default_version)?.id || base.id;
    });
    return next;
  }, [runs, resultsByRun, versionsByResultId]);

  const handleTabClick = useCallback(
    (e: React.MouseEvent, idx: number) => {
      if (e.shiftKey && runs.length > 1 && idx !== activeTab) {
        setSplitCompare({ left: activeTab, right: idx });
      } else {
        setActiveTab(idx);
      }
    },
    [activeTab, runs.length],
  );

  // Scroll active tab button into view when it changes
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTab]);

  // Tab / Shift+Tab to cycle agent tabs when this card is active
  useEffect(() => {
    if (!isActive || runs.length <= 1) return;
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key !== "Tab") return;
      e.preventDefault();
      setActiveTab((prev) =>
        e.shiftKey
          ? (prev - 1 + runs.length) % runs.length
          : (prev + 1) % runs.length,
      );
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isActive, runs.length]);

  const handleAutoAdvance = useCallback(
    (tabIdx: number) => {
      if (tabIdx + 1 < runs.length) {
        setActiveTab(tabIdx + 1);
      }
    },
    [runs.length],
  );

  return (
    <div className="bg-card rounded-lg p-4 px-6 mb-4">
      {/* Query text with inline number */}
      <div className="text-sm p-2.5 bg-[var(--surface)] rounded-lg mb-3 flex gap-2">
        <span className="font-bold text-primary shrink-0 pt-px">
          {query.ordinal || queryId}.
          {query.tag && (
            <span className="ml-1 inline-block px-1.5 py-0.5 rounded-xl text-[10px] font-semibold bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)] align-middle">
              {query.tag}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <MarkdownRenderer content={query.query_text || ""} />
        </div>
      </div>

      {/* Expected answer */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-brand/10 border border-brand/25">
        <h4 className="text-brand text-[10px] font-semibold uppercase tracking-wide mb-0.5">
          Expected
        </h4>
        <div className="text-sm text-foreground font-medium">
          <MarkdownRenderer content={query.expected_answer || ""} />
        </div>
        {query.comments && (
          <div className="mt-1.5 px-2.5 py-1 bg-[var(--tag-orange-bg)] border-l-[3px] border-warning rounded text-xs text-[var(--tag-orange-text)]">
            <strong>Note:</strong> {query.comments}
          </div>
        )}
      </div>

      {/* Tab bar */}
      {tabsMinimized ? (
        <div className="flex items-center gap-1.5 bg-[var(--surface-hover)] border-b-2 border-border rounded-t-lg px-3 py-2">
          {runs.map((run, idx) => {
            const r = resultsByRun[run.id];
            const grade = r?.grade?.grade || "not_graded";
            return (
              <button
                key={run.id}
                title={run.label}
                className={cn(
                  "w-3 h-3 rounded-full transition-all",
                  dotColors[grade],
                  idx === activeTab &&
                    "ring-2 ring-brand ring-offset-1 ring-offset-[var(--surface-hover)]",
                )}
                onClick={(e) => handleTabClick(e, idx)}
              />
            );
          })}
          <button
            className="ml-auto text-muted hover:text-foreground transition-colors p-0.5"
            onClick={() => setTabsMinimized(false)}
            title="Expand agent tabs"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex bg-[var(--surface-hover)] border-b-2 border-border rounded-t-lg overflow-x-auto">
          {runs.map((run, idx) => {
            const r = resultsByRun[run.id];
            const grade = r?.grade?.grade || "not_graded";
            return (
              <button
                key={run.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                className={cn(
                  "px-4 py-2.5 font-semibold text-sm text-muted border-b-[3px] border-transparent -mb-[2px] whitespace-nowrap transition-colors",
                  idx === activeTab
                    ? "text-foreground bg-card border-b-brand"
                    : "hover:bg-[var(--surface)] hover:text-foreground",
                )}
                onClick={(e) => handleTabClick(e, idx)}
              >
                {run.label}
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full inline-block ml-1.5",
                    dotColors[grade],
                  )}
                />
              </button>
            );
          })}
          <button
            className="ml-auto px-2 text-muted hover:text-foreground transition-colors flex-shrink-0"
            onClick={() => setTabsMinimized(true)}
            title="Minimize agent tabs"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 10l4-4 4 4" />
            </svg>
          </button>
        </div>
      )}

      {/* Split compare modal */}
      {splitCompare && (
        <SplitCompareModal
          queryId={queryId}
          query={query}
          runs={runs}
          resultsByRun={resultsByRun}
          initialLeft={splitCompare.left}
          initialRight={splitCompare.right}
          onGrade={onGrade}
          onOpenToolModal={onOpenToolModal}
          onClose={() => setSplitCompare(null)}
        />
      )}

      {/* Tab panels */}
      {runs.map((run, idx) => {
        const base = resultsByRun[run.id];
        if (idx !== activeTab) return null;
        if (!base) {
          return (
            <div key={run.id} className="p-4 text-muted-light italic">
              No data for this query
            </div>
          );
        }
        const versions = versionsByResultId[base.id] || [base];
        const selectedVersionId =
          selectedVersionByRun[run.id] ||
          defaultVersionByRun[run.id] ||
          base.id;
        const r =
          versions.find((v) => v.id === selectedVersionId) || versions[0];
        const grade = r.grade?.grade || "";
        const tokens = r.usage?.total_tokens
          ? r.usage.total_tokens.toLocaleString()
          : "N/A";
        const time = r.execution_time_seconds
          ? r.execution_time_seconds.toFixed(1) + "s"
          : "N/A";
        const counts = countByKind(r.tool_calls);

        return (
          <div key={run.id} className="p-3">
            {versions.length > 1 && (
              <div className="mb-2 flex items-center justify-end gap-1.5 flex-wrap">
                <select
                  className="px-2 py-1 rounded text-[11px] bg-[var(--surface)] border border-border text-foreground outline-none"
                  value={String(r.id)}
                  onChange={(e) =>
                    setSelectedVersionByRun((prev) => ({
                      ...prev,
                      [run.id]: parseInt(e.target.value, 10),
                    }))
                  }
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.version_number}
                      {version.is_default_version ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                {!r.is_default_version && (
                  <>
                    <button
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]"
                      onClick={() => onAcceptVersion(base.id, r.id)}
                    >
                      Set default
                    </button>
                    <button
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--tag-orange-bg)] text-[var(--tag-orange-text)]"
                      onClick={() => {
                        const ok = window.confirm(
                          "This version will be deleted. Do you really want to continue?",
                        );
                        if (!ok) return;
                        onIgnoreVersion(base.id, r.id);
                      }}
                    >
                      Ignore
                    </button>
                  </>
                )}
              </div>
            )}
            <div
              className={cn(
                "bg-[var(--surface)] border-2 border-border rounded-lg p-3 mb-2 max-h-[300px] overflow-y-auto whitespace-pre-wrap text-sm",
                grade && borderColors[grade],
              )}
            >
              {r.error ? (
                <div className="text-destructive font-semibold">
                  ERROR: {r.error}
                </div>
              ) : (
                <MarkdownRenderer content={r.agent_response || "N/A"} />
              )}
            </div>

            <div className="flex items-center gap-2 mt-2">
              {(["correct", "partial", "wrong"] as GradeValue[]).map((g) => (
                <GradeButton
                  key={g}
                  grade={g}
                  active={grade === g}
                  onClick={() => {
                    onGrade(r.id, g, queryId, idx);
                    handleAutoAdvance(idx);
                  }}
                />
              ))}
              <div className="ml-auto flex items-center gap-1">
                <button
                  className="w-7 h-7 rounded-lg border border-border bg-[var(--surface)] text-muted hover:text-foreground hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
                  onClick={() => {
                    const text = r.agent_response || "";
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  title="Copy response"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <button
                  className="w-7 h-7 rounded-lg border border-border bg-[var(--surface)] text-muted hover:text-foreground hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
                  onClick={() => onRetry(base.id)}
                  title="Retry query"
                  disabled={isRetrying}
                >
                  <RotateCcw
                    size={13}
                    className={isRetrying ? "animate-spin" : ""}
                  />
                </button>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-border text-xs text-muted flex items-center gap-3 flex-wrap">
              <span>{time}</span>
              <span className="text-border">|</span>
              <span>{tokens} tokens</span>
              {(counts.tools > 0 || counts.searches > 0) && (
                <>
                  <span className="text-border">|</span>
                  <button
                    className="hover:text-primary transition-colors cursor-pointer"
                    onClick={() => onOpenToolModal(r.id, 0, run.label)}
                  >
                    {counts.tools + counts.searches} tool call
                    {counts.tools + counts.searches !== 1 ? "s" : ""}
                  </button>
                </>
              )}
              {r.reasoning && r.reasoning.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  <span>
                    {r.reasoning.length} reasoning step
                    {r.reasoning.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
