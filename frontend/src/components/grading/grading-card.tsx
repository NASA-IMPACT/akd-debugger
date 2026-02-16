"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResultOut, GradeValue } from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { GradeButton } from "./grade-button";
import { ReasoningDisplay } from "./reasoning-display";
import { ToolPills } from "@/components/tool-calls/tool-pills";
import { countByKind } from "@/lib/tool-call-utils";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

interface Props {
  result: ResultOut;
  versions: ResultOut[];
  onGrade: (resultId: number, grade: GradeValue) => void;
  onOpenToolModal: (resultId: number, idx: number) => void;
  onRetry: (resultId: number) => void;
  onAcceptVersion: (resultId: number, versionId: number) => void;
  onIgnoreVersion: (resultId: number, versionId: number) => void;
  isRetrying?: boolean;
}

const borderColors: Record<string, string> = {
  correct: "border-grade-correct-border bg-grade-correct-bg",
  partial: "border-grade-partial-border bg-grade-partial-bg",
  wrong: "border-grade-wrong-border bg-grade-wrong-bg",
};

export function GradingCard({
  result,
  versions,
  onGrade,
  onOpenToolModal,
  onRetry,
  onAcceptVersion,
  onIgnoreVersion,
  isRetrying = false,
}: Props) {
  const [selectedVersionId, setSelectedVersionId] = useState<number>(result.id);
  const current = useMemo(
    () => versions.find((v) => v.id === selectedVersionId)
      || versions.find((v) => v.is_default_version)
      || result,
    [versions, selectedVersionId, result]
  );
  useEffect(() => {
    setSelectedVersionId((prev) => (versions.some((v) => v.id === prev) ? prev : result.id));
  }, [versions, result.id]);

  const q = current.query || result.query;
  const grade = current.grade?.grade || "";
  const tokens = current.usage?.total_tokens ? current.usage.total_tokens.toLocaleString() : "N/A";
  const time = current.execution_time_seconds ? current.execution_time_seconds.toFixed(1) + "s" : "N/A";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const counts = useMemo(() => countByKind(current.tool_calls), [current.tool_calls]);

  const handleToolClick = useCallback(
    (idx: number) => onOpenToolModal(current.id, idx),
    [current.id, onOpenToolModal]
  );

  return (
    <div id={`result-${result.id}`} className="bg-card rounded-lg p-6 px-8 mb-6">
      {/* Header */}
      <div className="border-b-2 border-border pb-3 mb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">
          Query #{q?.ordinal || result.query_id}
          {q?.tag && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded-xl text-xs font-semibold bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]">
              {q.tag}
            </span>
          )}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            className="w-8 h-8 rounded-lg border border-border bg-[var(--surface)] text-muted hover:text-foreground hover:bg-[var(--surface-hover)] flex items-center justify-center"
            onClick={() => onRetry(result.id)}
            title="Retry query"
            disabled={isRetrying}
          >
            <RotateCcw size={14} className={isRetrying ? "animate-spin" : ""} />
          </button>
          {versions.length > 1 && (
            <>
              <select
                className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--surface)] border border-border text-foreground outline-none"
                value={String(current.id)}
                onChange={(e) => setSelectedVersionId(parseInt(e.target.value, 10))}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.version_number}{version.is_default_version ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {!current.is_default_version && (
                <>
                  <button
                    className="px-2.5 py-1 rounded text-xs font-medium bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]"
                    onClick={() => onAcceptVersion(result.id, current.id)}
                  >
                    Set default
                  </button>
                  <button
                    className="px-2.5 py-1 rounded text-xs font-medium bg-[var(--tag-orange-bg)] text-[var(--tag-orange-text)]"
                    onClick={() => {
                      const ok = window.confirm(
                        "This version will be deleted. Do you really want to continue?"
                      );
                      if (!ok) return;
                      onIgnoreVersion(result.id, current.id);
                    }}
                  >
                    Ignore
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Query text */}
      <div className="text-base p-3 bg-[var(--surface)] rounded-lg border-l-4 border-brand mb-4">
        <MarkdownRenderer content={q?.query_text || ""} />
      </div>

      {/* Expected answer */}
      <div className="mb-4">
        <h4 className="text-muted text-sm font-semibold mb-2">Expected Answer</h4>
        <MarkdownRenderer content={q?.expected_answer || ""} />
        {q?.comments && (
          <div className="mt-2 px-3 py-1.5 bg-[var(--tag-orange-bg)] border-l-[3px] border-[var(--tag-orange-text)] rounded text-sm text-[var(--tag-orange-text)]">
            <strong>Note:</strong> {q.comments}
          </div>
        )}
      </div>

      {/* Agent response */}
      <h4 className="text-sm font-semibold mb-2">Agent Response</h4>
      <div
        className={cn(
          "bg-[var(--surface)] border-2 border-border rounded-lg p-4 mb-3 max-h-[400px] overflow-y-auto whitespace-pre-wrap text-sm",
          grade && borderColors[grade]
        )}
      >
        {current.error ? (
          <div className="text-destructive font-semibold">ERROR: {current.error}</div>
        ) : (
          <MarkdownRenderer content={current.agent_response || "N/A"} />
        )}
      </div>
      {/* Grade buttons */}
      <div className="flex gap-2 mt-3">
        {(["correct", "partial", "wrong"] as GradeValue[]).map((g) => (
          <GradeButton
            key={g}
            grade={g}
            active={grade === g}
            onClick={() => onGrade(current.id, g)}
          />
        ))}
      </div>

      {/* Meta */}
      <div className="mt-3 pt-3 border-t border-border text-sm text-muted flex gap-6 flex-wrap">
        <span><strong>Time:</strong> {time}</span>
        <span><strong>Tokens:</strong> {tokens}</span>
        {counts.tools > 0 && <span><strong>Tool Calls:</strong> {counts.tools}</span>}
        {counts.searches > 0 && <span><strong>Web Searches:</strong> {counts.searches}</span>}
        {counts.tools === 0 && counts.searches === 0 && <span><strong>Tool Calls:</strong> 0</span>}
      </div>

      <ToolPills toolCalls={current.tool_calls} onClickTool={handleToolClick} />
      <ReasoningDisplay reasoning={current.reasoning} />

    </div>
  );
}
