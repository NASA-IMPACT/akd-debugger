"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart } from "lucide-react";
import { analyticsApi } from "@/lib/api/analytics";
import type { RunAnalyticsOut } from "@/lib/types";
import { AccuracyChartModal } from "./accuracy-chart-modal";

interface Props {
  runIds: number[];
}

const barColors = ["#0066cc", "#ff9800", "#28a745", "#9c27b0", "#dc3545"];

export function CompareDashboard({ runIds }: Props) {
  const [chartOpen, setChartOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["compare-analytics", runIds.join(",")],
    queryFn: () => analyticsApi.compare(runIds),
  });

  if (isLoading || !data) return <div className="text-center py-8 text-muted">Loading analytics...</div>;

  const runs = data.runs || [];

  return (
    <>
      {/* Accuracy Overview */}
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
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2 bg-[var(--surface)] font-semibold">Run</th>
              <th className="text-right p-2 bg-[var(--surface)] font-semibold text-grade-correct-text">Correct</th>
              <th className="text-right p-2 bg-[var(--surface)] font-semibold text-grade-partial-text">Partial</th>
              <th className="text-right p-2 bg-[var(--surface)] font-semibold text-grade-wrong-text">Wrong</th>
              <th className="text-right p-2 bg-[var(--surface)] font-semibold">Accuracy</th>
              <th className="text-right p-2 bg-[var(--surface)] font-semibold">Weighted Score</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id} className="border-b border-border">
                <td className="p-2 font-semibold">{r.label}</td>
                <td className="p-2 text-right tabular-nums text-grade-correct-text font-semibold">{r.grade_counts.correct}</td>
                <td className="p-2 text-right tabular-nums text-grade-partial-text font-semibold">{r.grade_counts.partial}</td>
                <td className="p-2 text-right tabular-nums text-grade-wrong-text font-semibold">{r.grade_counts.wrong}</td>
                <td className="p-2 text-right tabular-nums">{r.grade_counts.accuracy.toFixed(1)}%</td>
                <td className="p-2 text-right tabular-nums font-bold">{r.grade_counts.weighted_score.toFixed(1)}%</td>
              </tr>
            ))}
            {runs.length > 1 && (
              <tr className="italic bg-[var(--surface)]">
                <td className="p-2">Mean</td>
                <td className="p-2"></td>
                <td className="p-2"></td>
                <td className="p-2"></td>
                <td className="p-2 text-right tabular-nums">
                  {(runs.reduce((s, r) => s + r.grade_counts.accuracy, 0) / runs.length).toFixed(1)}%
                </td>
                <td className="p-2 text-right tabular-nums">
                  {(runs.reduce((s, r) => s + r.grade_counts.weighted_score, 0) / runs.length).toFixed(1)}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Performance comparison (transposed: metrics as columns, agents as rows) */}
      <div className="bg-card rounded-lg p-6 px-8 mb-6">
        <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">Performance Stats</h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2 bg-[var(--surface)] font-semibold">Agent</th>
              {([["time", "Exec Time (s)"], ["tokens", "Total Tokens"], ["tools", "Tool Calls"]] as const).map(([key, label]) => (
                <th key={key} className="text-right p-2 bg-[var(--surface)] font-semibold" colSpan={2}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id} className="border-b border-border">
                <td className="p-2 font-semibold">{r.label}</td>
                {(["time", "tokens", "tools"] as const).map((key) => {
                  const st = r.performance[key];
                  if (st && st.n > 0) {
                    return [
                      <td key={`${key}-mean`} className="p-2 text-right tabular-nums">{st.mean.toFixed(1)}&plusmn;{st.std.toFixed(1)}</td>,
                      <td key={`${key}-med`} className="p-2 text-right tabular-nums">{st.median.toFixed(1)}</td>,
                    ];
                  }
                  return [
                    <td key={`${key}-mean`} className="p-2 text-right">N/A</td>,
                    <td key={`${key}-med`} className="p-2 text-right">N/A</td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tool usage comparison */}
      <ToolUsageComparison runs={runs} />

      <AccuracyChartModal
        open={chartOpen}
        onClose={() => setChartOpen(false)}
        runs={runs.map((r) => ({ label: r.label, gradeCounts: r.grade_counts }))}
        runIds={runIds}
      />
    </>
  );
}

function ToolUsageComparison({ runs }: { runs: RunAnalyticsOut[] }) {
  const allToolNames = new Set<string>();
  runs.forEach((r) => Object.keys(r.tool_usage || {}).forEach((n) => allToolNames.add(n)));
  if (!allToolNames.size) return null;

  let maxTotal = 0;
  [...allToolNames].forEach((n) => {
    let t = 0;
    runs.forEach((r) => { t += (r.tool_usage[n] || 0); });
    if (t > maxTotal) maxTotal = t;
  });

  return (
    <div className="bg-card rounded-lg p-6 px-8 mb-6">
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">Tool Usage Across Runs</h2>
      <div className="flex gap-4 mb-4 text-sm">
        {runs.map((r, i) => (
          <div key={r.run_id} className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded" style={{ background: barColors[i % barColors.length] }} />
            {r.label}
          </div>
        ))}
      </div>
      {[...allToolNames].sort().map((name) => (
        <div key={name} className="flex items-center gap-2 my-1 text-sm">
          <div className="w-44 text-right font-semibold text-xs shrink-0">{name}</div>
          <div className="flex gap-0.5 flex-1 items-center">
            {runs.map((r, i) => {
              const cnt = r.tool_usage[name] || 0;
              if (!cnt) return null;
              const w = Math.max(20, Math.round((cnt / maxTotal) * 250));
              return (
                <div
                  key={r.run_id}
                  className="h-5 rounded flex items-center justify-center text-white text-xs font-bold min-w-[20px]"
                  style={{ width: `${w}px`, background: barColors[i % barColors.length] }}
                  title={`${r.label}: ${cnt}`}
                >
                  {cnt}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
