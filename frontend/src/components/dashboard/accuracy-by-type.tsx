"use client";

import type { GradeCountsOut } from "@/lib/types";

interface Props {
  byType: Record<string, GradeCountsOut>;
}

export function AccuracyByType({ byType }: Props) {
  const entries = Object.entries(byType);
  if (!entries.length) return null;

  return (
    <div className="bg-card rounded-lg p-6 px-8 mb-6">
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">Accuracy by Query Type</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 bg-[var(--surface)] font-semibold">Type</th>
            <th className="text-right p-2 bg-[var(--surface)] font-semibold">Count</th>
            <th className="text-right p-2 bg-[var(--surface)] font-semibold">Score</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([type, counts]) => (
            <tr key={type} className="border-b border-border">
              <td className="p-2">
                <span className="inline-block px-2 py-0.5 rounded-xl text-xs font-semibold bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]">{type}</span>
              </td>
              <td className="p-2 text-right tabular-nums">{counts.total}</td>
              <td className="p-2 text-right tabular-nums">{counts.weighted_score.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
