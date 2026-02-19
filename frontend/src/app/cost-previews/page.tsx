"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { runsApi } from "@/lib/api/runs";
import { PageHeader } from "@/components/layout/page-header";
import type { RunCostPreviewRecordOut } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { copyMarkdownTable } from "@/lib/markdown-table";

export default function CostPreviewsPage() {
  const queryClient = useQueryClient();
  const { data: previews = [], isLoading, refetch } = useQuery({
    queryKey: ["cost-previews"],
    queryFn: () => runsApi.listPreviewCosts(200),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
  const [selected, setSelected] = useState<RunCostPreviewRecordOut | null>(null);
  const [copiedTable, setCopiedTable] = useState<"" | "cost" | "usage">("");

  const copySelectedCostTable = async () => {
    if (!selected || selected.status !== "completed") return;
    await copyMarkdownTable({
      headers: ["Cost Line", "Amount (USD)"],
      align: ["left", "right"],
      rows: [
        ["Input", (selected.cost_breakdown.input_cost_usd || 0).toFixed(2)],
        ["Cached Input", (selected.cost_breakdown.cached_input_cost_usd || 0).toFixed(2)],
        ["Output", (selected.cost_breakdown.output_cost_usd || 0).toFixed(2)],
        ["Reasoning", (selected.cost_breakdown.reasoning_output_cost_usd || 0).toFixed(2)],
        ["Web Search", (selected.cost_breakdown.web_search_cost_usd || 0).toFixed(2)],
        ["**Total (sample)**", `**${(selected.sample_cost_usd || 0).toFixed(2)}**`],
      ],
    });
    setCopiedTable("cost");
    setTimeout(() => setCopiedTable(""), 1200);
  };

  const copySelectedUsageTable = async () => {
    if (!selected || selected.status !== "completed") return;
    await copyMarkdownTable({
      headers: ["Usage Metric", "Total"],
      align: ["left", "right"],
      rows: [
        ["Input tokens", Math.round(selected.usage_totals.input_tokens || 0)],
        ["Cached tokens", Math.round(selected.usage_totals.cached_tokens || 0)],
        ["Output tokens", Math.round(selected.usage_totals.output_tokens || 0)],
        ["Reasoning tokens", Math.round(selected.usage_totals.reasoning_tokens || 0)],
        ["Web search calls", Math.round(selected.usage_totals.web_search_calls || 0)],
        ["Sample size", selected.sample_size],
        ["Estimated calls", selected.estimated_total_calls],
      ],
    });
    setCopiedTable("usage");
    setTimeout(() => setCopiedTable(""), 1200);
  };

  const retryMutation = useMutation({
    mutationFn: (previewId: number) => runsApi.retryPreviewCost(previewId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["cost-previews"] }),
  });

  return (
    <>
      <PageHeader title="Cost Previews" subtitle={<div className="text-sm text-muted mt-1">Background cost preview jobs and results</div>}>
        <button
          onClick={() => refetch()}
          className="px-3.5 py-1.5 bg-primary text-primary-foreground rounded-md font-medium text-[13px]"
        >
          Refresh
        </button>
      </PageHeader>
      <div className="bg-card rounded-lg border border-border overflow-x-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-muted">Loading...</div>
        ) : previews.length === 0 ? (
          <div className="p-4 text-sm text-muted">No cost previews yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-hover)]">
              <tr>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Label</th>
                <th className="text-left p-3">Dataset</th>
                <th className="text-left p-3">Agent</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Estimated Total</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p: RunCostPreviewRecordOut) => (
                <tr key={p.id} className="border-t border-border hover:bg-[var(--surface-hover)] cursor-pointer" onClick={() => setSelected(p)}>
                  <td className="p-3">#{p.id}</td>
                  <td className="p-3">{p.label}</td>
                  <td className="p-3">{p.suite_name || "-"}</td>
                  <td className="p-3">{p.agent_name || "-"}</td>
                  <td className="p-3">
                    <div className="inline-flex items-center gap-2">
                      <span>{p.status}</span>
                      {(p.status === "pending" || p.status === "failed") && (
                        <button
                          className="px-2 py-1 bg-[var(--surface-hover)] border border-border rounded-md text-xs font-semibold"
                          disabled={retryMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMutation.mutate(p.id);
                          }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">${p.estimated_total_cost_usd.toFixed(2)} {p.currency}</td>
                  <td className="p-3">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-card border border-border rounded-lg w-[95%] max-w-[980px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Cost Preview #{selected.id}</h3>
              <div className="flex items-center gap-2">
                <button className="text-[13px] px-3 py-1.5 bg-[var(--surface-hover)] border border-border rounded-md" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
              <div><div className="text-muted-light text-xs">Label</div><div className="font-semibold">{selected.label}</div></div>
              <div><div className="text-muted-light text-xs">Dataset</div><div className="font-semibold">{selected.suite_name || "-"}</div></div>
              <div><div className="text-muted-light text-xs">Agent</div><div className="font-semibold">{selected.agent_name || "-"}</div></div>
              <div><div className="text-muted-light text-xs">Status</div><div className="font-semibold">{selected.status}</div></div>
              <div><div className="text-muted-light text-xs">Estimated Total</div><div className="font-bold">${selected.estimated_total_cost_usd.toFixed(2)} {selected.currency}</div></div>
            </div>
            {selected.error_message && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--grade-wrong-bg)] text-[var(--grade-wrong-text)] text-sm">
                {selected.error_message}
              </div>
            )}
            {selected.status === "completed" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-lg border border-border bg-[var(--surface-hover)]">
                    <div className="text-xs text-muted-light">Estimated total</div>
                    <div className="font-semibold">${selected.estimated_total_cost_usd.toFixed(2)} {selected.currency}</div>
                  </div>
                  <div className="p-2 rounded-lg border border-border bg-[var(--surface-hover)]">
                    <div className="text-xs text-muted-light">Sample cost</div>
                    <div className="font-semibold">${selected.sample_cost_usd.toFixed(2)} {selected.currency}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-light uppercase tracking-wide">Cost Table</div>
                  <button
                    type="button"
                    onClick={copySelectedCostTable}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card hover:bg-[var(--surface-hover)] text-xs"
                    title="Copy cost table (Markdown)"
                    aria-label="Copy cost table"
                  >
                    {copiedTable === "cost" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="overflow-x-auto border border-border rounded-lg bg-[var(--surface-hover)]">
                  <table className="w-full text-xs">
                    <thead className="bg-black/5 text-muted-light uppercase tracking-wide">
                      <tr>
                        <th className="p-2 text-left font-semibold">Cost Line</th>
                        <th className="p-2 text-right font-semibold">Amount (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border/60"><td className="p-2">Input</td><td className="p-2 text-right">{(selected.cost_breakdown.input_cost_usd || 0).toFixed(2)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Cached Input</td><td className="p-2 text-right">{(selected.cost_breakdown.cached_input_cost_usd || 0).toFixed(2)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Output</td><td className="p-2 text-right">{(selected.cost_breakdown.output_cost_usd || 0).toFixed(2)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Reasoning</td><td className="p-2 text-right">{(selected.cost_breakdown.reasoning_output_cost_usd || 0).toFixed(2)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Web Search</td><td className="p-2 text-right">{(selected.cost_breakdown.web_search_cost_usd || 0).toFixed(2)}</td></tr>
                      <tr className="border-t border-border/60 bg-black/5"><td className="p-2 font-semibold">Total (sample)</td><td className="p-2 text-right font-semibold">{(selected.sample_cost_usd || 0).toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-light uppercase tracking-wide">Usage Table</div>
                  <button
                    type="button"
                    onClick={copySelectedUsageTable}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card hover:bg-[var(--surface-hover)] text-xs"
                    title="Copy usage table (Markdown)"
                    aria-label="Copy usage table"
                  >
                    {copiedTable === "usage" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="overflow-x-auto border border-border rounded-lg bg-[var(--surface-hover)]">
                  <table className="w-full text-xs">
                    <thead className="bg-black/5 text-muted-light uppercase tracking-wide">
                      <tr>
                        <th className="p-2 text-left font-semibold">Usage Metric</th>
                        <th className="p-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border/60"><td className="p-2">Input tokens</td><td className="p-2 text-right">{Math.round(selected.usage_totals.input_tokens || 0)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Cached tokens</td><td className="p-2 text-right">{Math.round(selected.usage_totals.cached_tokens || 0)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Output tokens</td><td className="p-2 text-right">{Math.round(selected.usage_totals.output_tokens || 0)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Reasoning tokens</td><td className="p-2 text-right">{Math.round(selected.usage_totals.reasoning_tokens || 0)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Web search calls</td><td className="p-2 text-right">{Math.round(selected.usage_totals.web_search_calls || 0)}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Sample size</td><td className="p-2 text-right">{selected.sample_size}</td></tr>
                      <tr className="border-t border-border/60"><td className="p-2">Estimated calls</td><td className="p-2 text-right">{selected.estimated_total_calls}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted">Preview is {selected.status}. Refresh in a few seconds.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
