"use client";

import { cn } from "@/lib/utils";

interface Props {
  toolUsage: Record<string, number>;
}

const WS_PREFIX = "web_search:";

function isWebSearch(name: string) {
  return name.startsWith(WS_PREFIX) || name === "web_search";
}

function formatLabel(name: string): string {
  if (name.startsWith(WS_PREFIX)) {
    const action = name.slice(WS_PREFIX.length);
    const labels: Record<string, string> = {
      search: "Web Search",
      open_page: "Open Page",
      find_in_page: "Find in Page",
    };
    return labels[action] || action;
  }
  if (name === "web_search") return "Web Search";
  return name;
}

export function ToolUsageChart({ toolUsage }: Props) {
  const entries = Object.entries(toolUsage);
  if (!entries.length) return null;

  const maxVal = Math.max(...entries.map(([, v]) => v));
  const sorted = entries.sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-card rounded-lg p-6 px-8 mb-6">
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">Tool Usage</h2>
      {sorted.map(([name, count]) => {
        const w = Math.max(20, Math.round((count / maxVal) * 300));
        const ws = isWebSearch(name);
        return (
          <div key={name} className="flex items-center gap-2 my-1 text-sm">
            <div className="w-44 text-right font-semibold text-xs shrink-0">{formatLabel(name)}</div>
            <div
              className={cn(
                "h-5 rounded flex items-center justify-center text-white text-xs font-bold min-w-[20px]",
                ws ? "bg-emerald-500" : "bg-brand",
              )}
              style={{ width: `${w}px` }}
            >
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}
