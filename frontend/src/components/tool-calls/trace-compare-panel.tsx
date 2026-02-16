"use client";

import { useState, useMemo } from "react";
import type { ToolCall, ReasoningStep } from "@/lib/types";
import { normalizeSteps, type NormalizedStep } from "@/lib/tool-call-utils";
import {
  getSearchText,
  countMatches,
  getReasoningSearchText,
} from "@/lib/tool-call-search";
import { JsonSection } from "@/components/json/json-section";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface SideData {
  label: string;
  toolCalls: ToolCall[] | null;
  reasoning: ReasoningStep[] | null;
}

interface TraceComparePanelProps {
  left: SideData;
  right: SideData;
  queryLabel?: string;
}

type ViewMode = "tool_calls" | "reasoning";

interface ToolMatchInfo {
  step: NormalizedStep;
  idx: number;
  matchCount: number;
  searchText: string;
}

interface ReasoningMatchInfo {
  step: ReasoningStep;
  idx: number;
  matchCount: number;
}

function computeToolMatches(
  toolCalls: ToolCall[] | null,
  query: string,
): ToolMatchInfo[] {
  const steps = normalizeSteps(toolCalls);
  const ql = query.toLowerCase().trim();
  return steps.map((step, idx) => {
    const searchText = getSearchText(step.raw);
    return {
      step,
      idx,
      matchCount: ql ? countMatches(searchText, ql) : 0,
      searchText,
    };
  });
}

function computeReasoningMatches(
  reasoning: ReasoningStep[] | null,
  query: string,
): ReasoningMatchInfo[] {
  if (!reasoning?.length) return [];
  const ql = query.toLowerCase().trim();
  return reasoning.map((step, idx) => {
    const text = getReasoningSearchText(step);
    return { step, idx, matchCount: ql ? countMatches(text, ql) : 0 };
  });
}

function ToolCallAccordion({
  items,
  searchQuery,
}: {
  items: ToolMatchInfo[];
  searchQuery: string;
}) {
  const ql = searchQuery.toLowerCase().trim();
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  // Auto-expand matching items when search changes
  const autoExpanded = useMemo(() => {
    if (!ql) return new Set<number>();
    return new Set(items.filter((it) => it.matchCount > 0).map((it) => it.idx));
  }, [items, ql]);

  const isOpen = (idx: number) => openSet.has(idx) || autoExpanded.has(idx);

  const toggle = (idx: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (items.length === 0) {
    return <div className="p-4 text-sm text-muted italic">No tool calls</div>;
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const hidden = ql && item.matchCount === 0;
        if (hidden) return null;
        const open = isOpen(item.idx);
        return (
          <div
            key={item.idx}
            className="border-b border-border last:border-b-0"
          >
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--surface-hover)] transition-colors"
              onClick={() => toggle(item.idx)}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-border text-muted">
                {item.idx + 1}
              </span>
              <span className="truncate flex-1 font-medium">
                {item.step.label}
              </span>
              {item.matchCount > 0 && (
                <span className="shrink-0 text-[10px] bg-yellow-400/30 text-foreground/70 rounded px-1 font-medium">
                  {item.matchCount}
                </span>
              )}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className={cn(
                  "shrink-0 transition-transform",
                  open && "rotate-180",
                )}
              >
                <path d="M3 4.5l3 3 3-3" />
              </svg>
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2">
                <div className="max-h-[200px] overflow-auto">
                  <JsonSection
                    title="Input"
                    data={item.step.raw.arguments}
                    searchQuery={searchQuery}
                  />
                </div>
                <div className="max-h-[200px] overflow-auto">
                  <JsonSection
                    title="Output"
                    data={item.step.raw.response}
                    searchQuery={searchQuery}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReasoningColumn({
  items,
  searchQuery,
}: {
  items: ReasoningMatchInfo[];
  searchQuery: string;
}) {
  const ql = searchQuery.toLowerCase().trim();

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted italic">No reasoning steps</div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {items.map((item) => {
        const hidden = ql && item.matchCount === 0;
        if (hidden) return null;
        return (
          <div
            key={item.idx}
            className={cn(
              "border-l-[3px] border-[var(--tag-purple-text)] pl-3 py-2 bg-[var(--tag-purple-bg)] rounded-r-md",
              ql && item.matchCount > 0 && "ring-1 ring-yellow-400/50",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-[var(--tag-purple-text)] text-white">
                {item.idx + 1}
              </span>
              {item.matchCount > 0 && (
                <span className="text-[10px] bg-yellow-400/30 text-foreground/70 rounded px-1 font-medium">
                  {item.matchCount}
                </span>
              )}
            </div>
            {item.step.summary &&
              (Array.isArray(item.step.summary) ? (
                item.step.summary.map((s, j) => (
                  <div key={j} className="text-sm text-foreground/80">
                    <MarkdownRenderer content={s} />
                  </div>
                ))
              ) : (
                <div className="text-sm text-foreground/80">
                  <MarkdownRenderer content={item.step.summary} />
                </div>
              ))}
            {item.step.content?.map((c, j) =>
              typeof c === "string" ? (
                <div key={j} className="text-sm text-foreground/80">
                  <MarkdownRenderer content={c} />
                </div>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TraceComparePanel({
  left,
  right,
  queryLabel,
}: TraceComparePanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("tool_calls");
  const [searchQuery, setSearchQuery] = useState("");

  const leftToolMatches = useMemo(
    () => computeToolMatches(left.toolCalls, searchQuery),
    [left.toolCalls, searchQuery],
  );
  const rightToolMatches = useMemo(
    () => computeToolMatches(right.toolCalls, searchQuery),
    [right.toolCalls, searchQuery],
  );
  const leftReasoningMatches = useMemo(
    () => computeReasoningMatches(left.reasoning, searchQuery),
    [left.reasoning, searchQuery],
  );
  const rightReasoningMatches = useMemo(
    () => computeReasoningMatches(right.reasoning, searchQuery),
    [right.reasoning, searchQuery],
  );

  const ql = searchQuery.toLowerCase().trim();

  // Stats for current view
  const stats = useMemo(() => {
    if (viewMode === "tool_calls") {
      const lTotal = leftToolMatches.reduce((s, it) => s + it.matchCount, 0);
      const lSteps = leftToolMatches.filter((it) => it.matchCount > 0).length;
      const rTotal = rightToolMatches.reduce((s, it) => s + it.matchCount, 0);
      const rSteps = rightToolMatches.filter((it) => it.matchCount > 0).length;
      return {
        lTotal,
        lSteps,
        lCount: leftToolMatches.length,
        rTotal,
        rSteps,
        rCount: rightToolMatches.length,
      };
    }
    const lTotal = leftReasoningMatches.reduce((s, it) => s + it.matchCount, 0);
    const lSteps = leftReasoningMatches.filter(
      (it) => it.matchCount > 0,
    ).length;
    const rTotal = rightReasoningMatches.reduce(
      (s, it) => s + it.matchCount,
      0,
    );
    const rSteps = rightReasoningMatches.filter(
      (it) => it.matchCount > 0,
    ).length;
    return {
      lTotal,
      lSteps,
      lCount: leftReasoningMatches.length,
      rTotal,
      rSteps,
      rCount: rightReasoningMatches.length,
    };
  }, [
    viewMode,
    leftToolMatches,
    rightToolMatches,
    leftReasoningMatches,
    rightReasoningMatches,
  ]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 flex-wrap">
        {queryLabel && (
          <span className="text-sm font-semibold text-muted shrink-0">
            {queryLabel}
          </span>
        )}
        <div className="flex gap-0.5 bg-[var(--surface-hover)] border border-border rounded-md p-0.5">
          <button
            type="button"
            className={cn(
              "px-3 py-1 rounded text-xs font-semibold transition-colors",
              viewMode === "tool_calls"
                ? "bg-[var(--surface-hover)] text-foreground"
                : "text-muted hover:text-foreground",
            )}
            onClick={() => setViewMode("tool_calls")}
          >
            Tool Calls
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1 rounded text-xs font-semibold transition-colors",
              viewMode === "reasoning"
                ? "bg-[var(--surface-hover)] text-foreground"
                : "text-muted hover:text-foreground",
            )}
            onClick={() => setViewMode("reasoning")}
          >
            Reasoning
          </button>
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="w-full pl-10 pr-2 py-1.5 border border-border rounded-md text-sm outline-none bg-card text-foreground focus:border-brand focus:ring-2 focus:ring-brand/15"
            placeholder="Search traces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQuery("");
            }}
          />
        </div>
      </div>

      {/* Search stats row */}
      {ql && (
        <div className="flex divide-x divide-border text-xs text-muted shrink-0 border-b border-border">
          <div className="flex-1 px-4 py-1.5">
            <span className="font-semibold">{left.label}:</span> {stats.lTotal}{" "}
            {stats.lTotal === 1 ? "match" : "matches"} in {stats.lSteps} of{" "}
            {stats.lCount} steps
          </div>
          <div className="flex-1 px-4 py-1.5">
            <span className="font-semibold">{right.label}:</span> {stats.rTotal}{" "}
            {stats.rTotal === 1 ? "match" : "matches"} in {stats.rSteps} of{" "}
            {stats.rCount} steps
          </div>
        </div>
      )}

      {/* Column headers */}
      <div className="flex divide-x divide-border text-xs font-semibold text-muted shrink-0 border-b border-border bg-[var(--surface)]">
        <div className="flex-1 px-4 py-1.5">{left.label}</div>
        <div className="flex-1 px-4 py-1.5">{right.label}</div>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0 divide-x divide-border">
        <div className="flex-1 overflow-y-auto">
          {viewMode === "tool_calls" ? (
            <ToolCallAccordion
              items={leftToolMatches}
              searchQuery={searchQuery}
            />
          ) : (
            <ReasoningColumn
              items={leftReasoningMatches}
              searchQuery={searchQuery}
            />
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {viewMode === "tool_calls" ? (
            <ToolCallAccordion
              items={rightToolMatches}
              searchQuery={searchQuery}
            />
          ) : (
            <ReasoningColumn
              items={rightReasoningMatches}
              searchQuery={searchQuery}
            />
          )}
        </div>
      </div>
    </div>
  );
}
