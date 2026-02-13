"use client";

import { useState, useMemo, type ReactNode } from "react";
import type { ToolCall } from "@/lib/types";
import { normalizeSteps, type NormalizedStep } from "@/lib/tool-call-utils";
import { getSearchText, countMatches } from "@/lib/tool-call-search";
import { cn } from "@/lib/utils";

interface Props {
  toolCalls: ToolCall[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  onSearchChange: (q: string) => void;
  searchQuery: string;
}

function highlightSnippet(snippet: string, query: string): ReactNode {
  if (!query || !snippet) return snippet;
  const ql = query.toLowerCase();
  const parts: ReactNode[] = [];
  const lower = snippet.toLowerCase();
  let lastIdx = 0;
  let pos = lower.indexOf(ql);
  let key = 0;
  while (pos >= 0) {
    if (pos > lastIdx) parts.push(snippet.slice(lastIdx, pos));
    parts.push(
      <mark key={key++} className="bg-yellow-400/50 text-inherit rounded-sm px-px">
        {snippet.slice(pos, pos + query.length)}
      </mark>
    );
    lastIdx = pos + query.length;
    pos = lower.indexOf(ql, lastIdx);
  }
  if (lastIdx < snippet.length) parts.push(snippet.slice(lastIdx));
  return <>{parts}</>;
}

const kindDotColor: Record<string, string> = {
  tool: "bg-brand",
  web_search: "bg-emerald-500",
};

export function ToolSidebar({ toolCalls, activeIdx, onSelect, onSearchChange, searchQuery }: Props) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const steps = useMemo(() => normalizeSteps(toolCalls), [toolCalls]);

  const filtered = useMemo(() => {
    if (!localQuery.trim()) return toolCalls.map((_, i) => ({ idx: i, match: true, snippet: "", matchCount: 0 }));
    const ql = localQuery.toLowerCase();
    return toolCalls.map((tc, i) => {
      const text = getSearchText(tc);
      const pos = text.toLowerCase().indexOf(ql);
      let snippet = "";
      const mc = countMatches(text, ql);
      if (pos >= 0) {
        const start = Math.max(0, pos - 20);
        const end = Math.min(text.length, pos + localQuery.length + 40);
        snippet = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
      }
      return { idx: i, match: pos >= 0, snippet, matchCount: mc };
    });
  }, [toolCalls, localQuery]);

  return (
    <div className="w-60 shrink-0 border-r-2 border-border flex flex-col bg-[var(--surface)]">
      <div className="p-2 border-b border-border shrink-0">
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-border rounded-md text-sm outline-none bg-card text-foreground focus:border-brand focus:ring-2 focus:ring-brand/15"
          placeholder="Search output..."
          value={localQuery}
          onChange={(e) => {
            setLocalQuery(e.target.value);
            onSearchChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setLocalQuery("");
              onSearchChange("");
            }
          }}
        />
      </div>
      {localQuery.trim() && (() => {
        const matchingItems = filtered.filter((f) => f.match);
        const totalMatches = filtered.reduce((sum, f) => sum + f.matchCount, 0);
        return (
          <div className="px-3 py-1.5 border-b border-border text-xs text-muted bg-[var(--surface)] shrink-0">
            {totalMatches} {totalMatches === 1 ? "match" : "matches"} in {matchingItems.length} of {toolCalls.length} step{toolCalls.length === 1 ? "" : "s"}
          </div>
        );
      })()}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {filtered.map((item) =>
          item.match ? (
            <SidebarItem
              key={item.idx}
              idx={item.idx}
              step={steps[item.idx]}
              active={item.idx === activeIdx}
              snippet={item.snippet}
              matchCount={item.matchCount}
              localQuery={localQuery}
              onSelect={onSelect}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

function SidebarItem({
  idx, step, active, snippet, matchCount, localQuery, onSelect,
}: {
  idx: number; step: NormalizedStep; active: boolean; snippet: string;
  matchCount: number; localQuery: string; onSelect: (idx: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border text-sm transition-colors",
        active
          ? "bg-[var(--tag-blue-bg)] border-l-[3px] border-l-brand font-semibold"
          : "hover:bg-[var(--surface-hover)]"
      )}
      onClick={() => onSelect(idx)}
    >
      <span
        className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          active ? kindDotColor[step.kind] + " text-white" : "bg-border text-muted"
        )}
      >
        {idx + 1}
      </span>
      <div className="overflow-hidden flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs">{step.label}</span>
          {matchCount > 0 && (
            <span className="shrink-0 text-[10px] bg-yellow-400/30 text-foreground/70 rounded px-1 font-medium">
              {matchCount}
            </span>
          )}
        </div>
        {step.kind === "web_search" && !snippet && (
          <div className="text-[10px] text-muted truncate mt-0.5">{step.detail}</div>
        )}
        {snippet && (
          <div className="text-xs text-muted truncate mt-0.5">
            {highlightSnippet(snippet, localQuery)}
          </div>
        )}
      </div>
    </div>
  );
}
