"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResultOut, GradeValue } from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { GradeButton } from "./grade-button";
import { countByKind } from "@/lib/tool-call-utils";
import { cn } from "@/lib/utils";
import { RotateCcw, Copy, Check } from "lucide-react";

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
    () =>
      versions.find((v) => v.id === selectedVersionId) ||
      versions.find((v) => v.is_default_version) ||
      result,
    [versions, selectedVersionId, result],
  );
  useEffect(() => {
    setSelectedVersionId((prev) =>
      versions.some((v) => v.id === prev) ? prev : result.id,
    );
  }, [versions, result.id]);

  const q = current.query || result.query;
  const grade = current.grade?.grade || "";
  const tokens = current.usage?.total_tokens
    ? current.usage.total_tokens.toLocaleString()
    : "N/A";
  const time = current.execution_time_seconds
    ? current.execution_time_seconds.toFixed(1) + "s"
    : "N/A";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const counts = useMemo(
    () => countByKind(current.tool_calls),
    [current.tool_calls],
  );

  const handleToolClick = useCallback(
    (idx: number) => onOpenToolModal(current.id, idx),
    [current.id, onOpenToolModal],
  );

  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    const text = current.agent_response || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [current.agent_response]);

  return (
    <div
      id={`result-${result.id}`}
      className="bg-card rounded-lg p-4 px-6 mb-4"
    >
      {/* Query text with inline number */}
      <div className="text-sm p-2.5 bg-[var(--surface)] rounded-lg mb-3 flex gap-2">
        <span className="font-bold text-primary shrink-0 pt-px">
          {q?.ordinal || result.query_id}.
          {q?.tag && (
            <span className="ml-1 inline-block px-1.5 py-0.5 rounded-xl text-[10px] font-semibold bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)] align-middle">
              {q.tag}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <MarkdownRenderer content={q?.query_text || ""} />
        </div>
      </div>

      {/* Expected answer */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-brand/10 border border-brand/25">
        <h4 className="text-brand text-[10px] font-semibold uppercase tracking-wide mb-0.5">
          Expected
        </h4>
        <div className="text-sm text-foreground font-medium">
          <MarkdownRenderer content={q?.expected_answer || ""} />
        </div>
        {q?.comments && (
          <div className="mt-1.5 px-2.5 py-1 bg-[var(--tag-orange-bg)] border-l-[3px] border-[var(--tag-orange-text)] rounded text-xs text-[var(--tag-orange-text)]">
            <strong>Note:</strong> {q.comments}
          </div>
        )}
      </div>

      {/* Agent response */}
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-xs font-semibold">Agent Response</h4>
        {versions.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <select
              className="px-2 py-1 rounded text-[11px] bg-[var(--surface)] border border-border text-foreground outline-none"
              value={String(current.id)}
              onChange={(e) =>
                setSelectedVersionId(parseInt(e.target.value, 10))
              }
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version_number}
                  {version.is_default_version ? " (default)" : ""}
                </option>
              ))}
            </select>
            {!current.is_default_version && (
              <>
                <button
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]"
                  onClick={() => onAcceptVersion(result.id, current.id)}
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
                    onIgnoreVersion(result.id, current.id);
                  }}
                >
                  Ignore
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div
        className={cn(
          "bg-[var(--surface)] border-2 border-border rounded-lg p-3 mb-2 max-h-[300px] overflow-y-auto whitespace-pre-wrap text-sm",
          grade && borderColors[grade],
        )}
      >
        {current.error ? (
          <div className="text-destructive font-semibold">
            ERROR: {current.error}
          </div>
        ) : (
          <MarkdownRenderer content={current.agent_response || "N/A"} />
        )}
      </div>
      {/* Grade buttons + actions */}
      <div className="flex items-center gap-2 mt-2">
        {(["correct", "partial", "wrong"] as GradeValue[]).map((g) => (
          <GradeButton
            key={g}
            grade={g}
            active={grade === g}
            onClick={() => onGrade(current.id, g)}
          />
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            className="w-7 h-7 rounded-lg border border-border bg-[var(--surface)] text-muted hover:text-foreground hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
            onClick={handleCopy}
            title="Copy response"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            className="w-7 h-7 rounded-lg border border-border bg-[var(--surface)] text-muted hover:text-foreground hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
            onClick={() => onRetry(result.id)}
            title="Retry query"
            disabled={isRetrying}
          >
            <RotateCcw size={13} className={isRetrying ? "animate-spin" : ""} />
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
              onClick={() => handleToolClick(0)}
            >
              {counts.tools + counts.searches} tool call
              {counts.tools + counts.searches !== 1 ? "s" : ""}
            </button>
          </>
        )}
        {current.reasoning && current.reasoning.length > 0 && (
          <>
            <span className="text-border">|</span>
            <span>
              {current.reasoning.length} reasoning step
              {current.reasoning.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
