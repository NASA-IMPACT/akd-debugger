"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { analyticsApi } from "@/lib/api/analytics";
import { AccuracyOverview } from "./accuracy-overview";
import { AccuracyByType } from "./accuracy-by-type";
import { PerformanceStats } from "./performance-stats";
import { ToolUsageChart } from "./tool-usage-chart";

interface Props {
  runId: number;
}

export function DashboardView({ runId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", runId],
    queryFn: () => analyticsApi.run(runId),
  });

  if (isLoading || !data) return <div className="text-center py-8 text-muted">Loading analytics...</div>;

  return (
    <>
      <AccuracyOverview gradeCounts={data.grade_counts} />
      <AccuracyByType byType={data.by_type} />
      <PerformanceStats performance={data.performance} />
      <ToolUsageChart toolUsage={data.tool_usage} />
      <RunCostSection
        pricingRates={data.pricing_rates || {}}
        costSummary={data.cost_summary || {}}
        queryCosts={data.query_costs || []}
      />
    </>
  );
}

function RunCostSection({
  pricingRates,
  costSummary,
  queryCosts,
}: {
  pricingRates: Record<string, string | number | boolean | null>;
  costSummary: Record<string, number>;
  queryCosts: Array<{
    query_id: number;
    ordinal: number;
    query_text: string;
    total_cost_usd: number;
    input_cost_usd: number;
    cached_input_cost_usd: number;
    output_cost_usd: number;
    reasoning_output_cost_usd: number;
    web_search_cost_usd: number;
    web_search_calls: number;
    usage: Record<string, number>;
  }>;
}) {
  const [open, setOpen] = useState(false);

  const modelKey = String(pricingRates.model_key || "unknown");
  const inputRate = Number(pricingRates.input_per_million || 0);
  const cachedRate = Number(pricingRates.cached_input_per_million || 0);
  const outputRate = Number(pricingRates.output_per_million || 0);
  const reasoningRate = Number(pricingRates.reasoning_output_per_million || 0);
  const webSearchRate = Number(pricingRates.web_search_per_call || 0);
  const pricingVersion = String(pricingRates.pricing_version || "unknown");
  const currency = String(pricingRates.currency || "USD");

  return (
    <div className="bg-card rounded-xl p-6 px-8 mb-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b-2 border-border text-brand-dark">
        Cost Summary
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-4">
        <div>
          <div className="text-muted-light text-xs">Total Cost (USD)</div>
          <div className="font-bold text-foreground">${(costSummary.total_cost_usd || 0).toFixed(6)}</div>
        </div>
        <div>
          <div className="text-muted-light text-xs">Input / Cached Tokens</div>
          <div className="font-semibold text-foreground">
            {Math.round(costSummary.input_tokens || 0)} / {Math.round(costSummary.cached_tokens || 0)}
          </div>
        </div>
        <div>
          <div className="text-muted-light text-xs">Output / Reasoning Tokens</div>
          <div className="font-semibold text-foreground">
            {Math.round(costSummary.output_tokens || 0)} / {Math.round(costSummary.reasoning_tokens || 0)}
          </div>
        </div>
      </div>

      <div className="mb-4 overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-hover)]">
            <tr>
              <th className="p-2 text-left">Pricing Field</th>
              <th className="p-2 text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border"><td className="p-2">Model key</td><td className="p-2 font-semibold">{modelKey}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Input ($ / 1M)</td><td className="p-2">{inputRate.toFixed(6)}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Cached input ($ / 1M)</td><td className="p-2">{cachedRate.toFixed(6)}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Output ($ / 1M)</td><td className="p-2">{outputRate.toFixed(6)}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Reasoning output ($ / 1M)</td><td className="p-2">{reasoningRate.toFixed(6)}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Web search ($ / call)</td><td className="p-2">{webSearchRate.toFixed(6)}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Pricing version</td><td className="p-2">{pricingVersion}</td></tr>
            <tr className="border-t border-border"><td className="p-2">Currency</td><td className="p-2">{currency}</td></tr>
          </tbody>
        </table>
      </div>

      <button
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--surface-hover)] border border-border hover:bg-[var(--surface)]"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Individual Query Cost Breakdown
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-hover)]">
              <tr>
                <th className="p-2 text-left">Query</th>
                <th className="p-2 text-right">Total $</th>
                <th className="p-2 text-right">Input $</th>
                <th className="p-2 text-right">Cached $</th>
                <th className="p-2 text-right">Output $</th>
                <th className="p-2 text-right">Reasoning $</th>
                <th className="p-2 text-right">Web $</th>
              </tr>
            </thead>
            <tbody>
              {queryCosts.map((q) => (
                <tr key={q.query_id} className="border-t border-border">
                  <td className="p-2">
                    <div className="font-semibold">Q{q.ordinal}</div>
                    <div className="text-muted-light truncate max-w-[340px]" title={q.query_text}>
                      {q.query_text}
                    </div>
                  </td>
                  <td className="p-2 text-right font-semibold">{q.total_cost_usd.toFixed(6)}</td>
                  <td className="p-2 text-right">{q.input_cost_usd.toFixed(6)}</td>
                  <td className="p-2 text-right">{q.cached_input_cost_usd.toFixed(6)}</td>
                  <td className="p-2 text-right">{q.output_cost_usd.toFixed(6)}</td>
                  <td className="p-2 text-right">{q.reasoning_output_cost_usd.toFixed(6)}</td>
                  <td className="p-2 text-right">{q.web_search_cost_usd.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
