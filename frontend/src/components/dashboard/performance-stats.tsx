"use client";

import type { StatsOut } from "@/lib/types";

interface Props {
  performance: Record<string, StatsOut>;
}

const metricLabels: [string, string][] = [
  ["time", "Exec Time (s)"],
  ["tokens", "Total Tokens"],
  ["tools", "Tool Calls"],
  ["reasoning", "Reasoning Tokens"],
];

export function PerformanceStats({ performance }: Props) {
  if (!performance) return null;

  return (
    <div className="bg-card rounded-lg p-6 px-8 mb-6">
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">Performance</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 bg-[var(--surface)] font-semibold">Metric</th>
            <th className="text-right p-2 bg-[var(--surface)] font-semibold">Mean &plusmn; Std</th>
            <th className="text-right p-2 bg-[var(--surface)] font-semibold">Median</th>
          </tr>
        </thead>
        <tbody>
          {metricLabels.map(([key, label]) => {
            const st = performance[key];
            if (!st || st.n === 0) return null;
            return (
              <tr key={key} className="border-b border-border">
                <td className="p-2 font-semibold">{label}</td>
                <td className="p-2 text-right tabular-nums">{st.mean.toFixed(1)} &plusmn; {st.std.toFixed(1)}</td>
                <td className="p-2 text-right tabular-nums">{st.median.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
