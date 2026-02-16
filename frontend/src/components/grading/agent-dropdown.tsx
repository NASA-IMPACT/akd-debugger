"use client";

import { useState, useEffect, useRef } from "react";
import type { ResultOut, RunDetailOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const dotColors: Record<string, string> = {
  correct: "bg-green-500",
  partial: "bg-yellow-400",
  wrong: "bg-red-500",
  not_graded: "bg-muted-light",
};

export function AgentDropdown({
  runs,
  resultsByRun,
  selectedIdx,
  onChange,
}: {
  runs: RunDetailOut[];
  resultsByRun: Record<number, ResultOut>;
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
  const selectedResult = selectedRun ? resultsByRun[selectedRun.id] : undefined;
  const selectedGrade = selectedResult?.grade?.grade || "not_graded";

  return (
    <div ref={ref} className="relative mb-3">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-[var(--surface)] text-sm font-medium hover:bg-[var(--surface-hover)] transition-colors"
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
            const r = resultsByRun[run.id];
            const grade = r?.grade?.grade || "not_graded";
            return (
              <button
                key={run.id}
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
