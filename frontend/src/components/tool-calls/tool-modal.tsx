"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ToolCall } from "@/lib/types";
import { normalizeSteps } from "@/lib/tool-call-utils";
import { ToolSidebar } from "./tool-sidebar";
import { ToolContent } from "./tool-content";
import { FullscreenViewer } from "@/components/json/fullscreen-viewer";

interface Props {
  toolCalls: ToolCall[];
  initialIdx?: number;
  queryLabel?: string;
  runLabel?: string;
  zIndex?: number;
  onClose: () => void;
}

export function ToolModal({
  toolCalls,
  initialIdx = 0,
  queryLabel,
  runLabel,
  zIndex = 1000,
  onClose,
}: Props) {
  const [activeIdx, setActiveIdx] = useState(initialIdx);
  const [searchQuery, setSearchQuery] = useState("");
  const [fullscreen, setFullscreen] = useState<{ which: "args" | "resp" } | null>(null);

  const tc = toolCalls[activeIdx];
  const steps = useMemo(() => normalizeSteps(toolCalls), [toolCalls]);
  const currentStep = steps[activeIdx];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT") return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(toolCalls.length - 1, i + 1));
      }
    }
    if (!fullscreen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [onClose, toolCalls.length, fullscreen]);

  const handleFullscreen = useCallback((which: "args" | "resp") => {
    setFullscreen({ which });
  }, []);

  if (fullscreen) {
    const isWebSearch = currentStep?.kind === "web_search";
    const data = isWebSearch
      ? (tc.raw_items || tc)
      : (fullscreen.which === "args" ? tc.arguments : tc.response);
    const label = isWebSearch ? "Raw Data" : (fullscreen.which === "args" ? "Input (Arguments)" : "Output (Response)");
    const name = currentStep?.label || tc.name || "unknown";
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center"
        style={{ zIndex }}
        onClick={(e) => e.target === e.currentTarget && setFullscreen(null)}
      >
        <FullscreenViewer
          data={data}
          title={`${name} — ${label}`}
          initialQuery={searchQuery}
          onClose={() => setFullscreen(null)}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ zIndex }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-xl w-[95%] max-w-[1200px] h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b-2 border-border shrink-0">
          <h3 className="text-lg text-brand-dark flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-sm font-semibold ${
              currentStep?.kind === "web_search"
                ? "bg-[var(--tag-teal-bg,var(--tag-green-bg))] text-[var(--tag-teal-text,var(--tag-green-text))]"
                : "bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]"
            }`}>
              {currentStep?.label || tc?.name || "unknown"}
            </span>
            <span className="text-xs text-muted font-normal">
              Step {activeIdx + 1} of {toolCalls.length}
              {queryLabel && <> &middot; {queryLabel}</>}
              {runLabel && <> &middot; {runLabel}</>}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-2xl text-muted hover:text-foreground hover:bg-[var(--surface-hover)] rounded-md px-2 py-0.5"
          >
            &times;
          </button>
        </div>

        {/* Split body */}
        <div className="flex flex-1 min-h-0">
          <ToolSidebar
            toolCalls={toolCalls}
            activeIdx={activeIdx}
            onSelect={setActiveIdx}
            onSearchChange={setSearchQuery}
            searchQuery={searchQuery}
          />
          {tc && (
            <ToolContent
              toolCall={tc}
              searchQuery={searchQuery}
              onFullscreen={handleFullscreen}
            />
          )}
        </div>
      </div>
    </div>
  );
}
