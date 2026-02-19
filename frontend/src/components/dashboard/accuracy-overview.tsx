"use client";

import { useState } from "react";
import { AreaChart } from "lucide-react";
import type { GradeCountsOut } from "@/lib/types";
import { AccuracyChartModal } from "./accuracy-chart-modal";

interface Props {
  gradeCounts: GradeCountsOut;
  runLabel: string;
  runId: number;
}

export function AccuracyOverview({ gradeCounts: gc, runLabel, runId }: Props) {
  const [chartOpen, setChartOpen] = useState(false);

  return (
    <div className="bg-card rounded-lg p-6 px-8 mb-6">
      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-border">
        <h2 className="text-lg font-semibold text-brand-dark">Accuracy Overview</h2>
        <button
          onClick={() => setChartOpen(true)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
          title="Show accuracy chart"
        >
          <AreaChart className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="flex gap-8 flex-wrap text-lg">
        <span className="text-grade-correct-text font-bold">Correct: {gc.correct}</span>
        <span className="text-grade-partial-text font-bold">Partial: {gc.partial}</span>
        <span className="text-grade-wrong-text font-bold">Wrong: {gc.wrong}</span>
        <span>Accuracy: {gc.accuracy.toFixed(1)}%</span>
        <span>Weighted Score: {gc.weighted_score.toFixed(1)}%</span>
      </div>

      <AccuracyChartModal
        open={chartOpen}
        onClose={() => setChartOpen(false)}
        runs={[{ label: runLabel, gradeCounts: gc }]}
        runIds={[runId]}
      />
    </div>
  );
}
