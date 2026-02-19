"use client";

import { useRef, useState, useEffect } from "react";
import type { ResultOut, RunDetailOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const groupColors = [
  { bg: "var(--tag-blue-bg)", label: "var(--tag-blue-text)" },
  { bg: "var(--tag-orange-bg)", label: "var(--tag-orange-text)" },
  { bg: "var(--tag-green-bg)", label: "var(--tag-green-text)" },
  { bg: "var(--tag-purple-bg)", label: "var(--tag-purple-text)" },
  { bg: "var(--tag-orange-bg)", label: "var(--tag-orange-text)" },
  { bg: "var(--tag-blue-bg)", label: "var(--tag-blue-text)" },
];

export interface GradeGroup {
  label: string;
  correct: number;
  partial: number;
  wrong: number;
  pending: number;
}

interface Props {
  groups: GradeGroup[];
}

export function GradeSummary({ groups }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-56px 0px 0px 0px" } // 56px = navbar height (h-14)
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Sentinel: when this scrolls above the navbar, the bar becomes floating */}
      <div ref={sentinelRef} className="h-0 w-full" />

      <div
        className={cn(
          "z-40 flex justify-center mb-6 transition-all duration-300 ease-out",
          pinned
            ? "fixed top-[72px] left-1/2 -translate-x-1/2 max-w-fit"
            : "sticky top-14"
        )}
      >
        <div
          className={cn(
            "flex justify-center items-center gap-4 flex-wrap rounded-xl transition-all duration-300 ease-out",
            pinned
              ? "glass-opaque px-5 py-2 gap-3 shadow-xl rounded-2xl scale-[0.88] origin-top"
              : "bg-card px-8 py-4 w-full"
          )}
        >
          {groups.map((g, i) => {
            const colors = groupColors[i % groupColors.length];
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center rounded-lg transition-all duration-300",
                  pinned ? "gap-2 px-2.5 py-1" : "gap-3 px-4 py-2",
                )}
                style={{ background: pinned ? `${colors.bg}cc` : colors.bg }}
              >
                {i > 0 && <div className={cn("bg-border -ml-2 mr-0.5", pinned ? "w-px h-5" : "w-0.5 h-8 -ml-4 mr-1")} />}
                <span
                  className={cn(
                    "font-bold mr-1 transition-all duration-300 truncate",
                    pinned ? "text-xs max-w-[80px]" : "text-sm"
                  )}
                  style={{ color: colors.label }}
                  title={g.label}
                >
                  {g.label}
                </span>
                <span className={cn("inline-flex items-center rounded-xl font-semibold bg-grade-correct-bg text-grade-correct-text", pinned ? "px-1.5 py-px text-xs" : "px-2 py-0.5 text-sm")}>{g.correct}</span>
                <span className={cn("inline-flex items-center rounded-xl font-semibold bg-grade-partial-bg text-grade-partial-text", pinned ? "px-1.5 py-px text-xs" : "px-2 py-0.5 text-sm")}>{g.partial}</span>
                <span className={cn("inline-flex items-center rounded-xl font-semibold bg-grade-wrong-bg text-grade-wrong-text", pinned ? "px-1.5 py-px text-xs" : "px-2 py-0.5 text-sm")}>{g.wrong}</span>
                <span className={cn("inline-flex items-center rounded-xl font-semibold bg-grade-pending-bg text-grade-pending-text", pinned ? "px-1.5 py-px text-xs" : "px-2 py-0.5 text-sm")}>{g.pending}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Helper to compute grade groups
export function computeGradeGroups(
  results: ResultOut[],
  label: string
): GradeGroup[] {
  let c = 0, p = 0, w = 0;
  results.forEach((r) => {
    if (r.grade?.grade === "correct") c++;
    else if (r.grade?.grade === "partial") p++;
    else if (r.grade?.grade === "wrong") w++;
  });
  return [{ label, correct: c, partial: p, wrong: w, pending: results.length - (c + p + w) }];
}

export function computeCompareGradeGroups(
  allResults: Record<number, Record<number, ResultOut>>,
  runs: RunDetailOut[],
  queryIds: number[]
): GradeGroup[] {
  return runs.map((run) => {
    let c = 0, p = 0, w = 0;
    queryIds.forEach((qid) => {
      const r = allResults[qid]?.[run.id];
      if (r?.grade?.grade === "correct") c++;
      else if (r?.grade?.grade === "partial") p++;
      else if (r?.grade?.grade === "wrong") w++;
    });
    return { label: run.label, correct: c, partial: p, wrong: w, pending: queryIds.length - (c + p + w) };
  });
}
