"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { JsonTree } from "@/components/json/json-tree";
import { tracesApi } from "@/lib/api/traces";
import type { TraceLogOut } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

export default function TracesPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<string>("all");
  const [runId, setRunId] = useState<string>("");
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);

  const runIdNum = useMemo(() => {
    const n = parseInt(runId, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [runId]);

  const { data: traces = [], isLoading, refetch } = useQuery({
    queryKey: ["traces", status, runIdNum],
    queryFn: () =>
      tracesApi.list({
        status: status === "all" ? undefined : status,
        runId: runIdNum,
        limit: 300,
      }),
    enabled: !!user,
  });
  const { data: filteredSummary } = useQuery({
    queryKey: ["traces-summary", status, runIdNum],
    queryFn: () =>
      tracesApi.summary({
        status: status === "all" ? undefined : status,
        runId: runIdNum,
      }),
    enabled: !!user,
  });
  const { data: allSummary } = useQuery({
    queryKey: ["traces-summary-all"],
    queryFn: () => tracesApi.summary(),
    enabled: !!user,
  });

  const selectedTrace: TraceLogOut | undefined = traces.find((t) => t.id === selectedTraceId) ?? traces[0];
  const usage = (selectedTrace?.usage || {}) as Record<string, unknown>;
  const costBreakdown = selectedTrace?.cost_breakdown || {};
  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  const inputTokens = toNumber(usage.input_tokens ?? usage.prompt_tokens);
  const cachedInputTokens = toNumber(usage.cached_tokens);
  const outputTokens = toNumber(usage.output_tokens ?? usage.completion_tokens);
  const reasoningTokens = toNumber(usage.reasoning_tokens);
  const webSearchCalls = toNumber(usage.web_search_calls);
  const nonCachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  const nonReasoningOutputTokens = Math.max(outputTokens - reasoningTokens, 0);
  const formatUsd = (amount: number): string => `$${amount.toFixed(2)}`;
  const formatRate = (cost: number, units: number, multiplier: number = 1): string => {
    if (units <= 0 || cost <= 0) return "—";
    return formatUsd((cost / units) * multiplier);
  };

  return (
    <>
      <PageHeader title="API Traces" subtitle={<div className="text-sm text-muted mt-1">OpenAI agent calls persisted in Postgres</div>}>
        <button
          onClick={() => refetch()}
          className="btn-subtle btn-subtle-primary"
        >
          Refresh
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="text-xs text-muted-light">Total Cost (all traces)</div>
          <div className="text-lg font-bold text-foreground">{formatUsd(allSummary?.total_cost_usd || 0)}</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="text-xs text-muted-light">Total Cost (current filter)</div>
          <div className="text-lg font-bold text-foreground">{formatUsd(filteredSummary?.total_cost_usd || 0)}</div>
        </div>
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="text-xs text-muted-light">Trace Count</div>
          <div className="text-lg font-bold text-foreground">{filteredSummary?.count || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-240px)]">
        <section className="bg-card rounded-lg border border-border overflow-hidden lg:min-h-0 flex flex-col">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-2.5 py-1.5 rounded-md text-[13px] bg-[var(--surface-hover)] border border-border text-foreground outline-none"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="started">Started</option>
            </select>
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="Run ID"
              className="w-full px-2.5 py-1.5 rounded-md text-[13px] bg-[var(--surface-hover)] border border-border text-foreground outline-none"
            />
          </div>

          <div className="max-h-[70vh] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-muted">Loading traces...</div>
            ) : traces.length === 0 ? (
              <div className="p-4 text-sm text-muted">No traces found.</div>
            ) : (
              traces.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTraceId(t.id)}
                  className={cn(
                    "w-full text-left p-3 border-b border-border/70 hover:bg-[var(--surface-hover)] transition-colors",
                    (selectedTrace?.id ?? null) === t.id && "bg-primary/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">Trace #{t.id}</div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      t.status === "completed" ? "bg-[var(--tag-green-bg)] text-[var(--tag-green-text)]" : "",
                      t.status === "failed" ? "bg-[var(--grade-wrong-bg)] text-[var(--grade-wrong-text)]" : "",
                      t.status === "started" ? "bg-[var(--grade-partial-bg)] text-[var(--grade-partial-text)]" : "",
                    )}>
                      {t.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    run {t.run_id ?? "-"} | query {t.query_id ?? "-"} | {t.model ?? "unknown-model"}
                  </div>
                  <div className="text-xs text-muted-light mt-0.5">
                    {formatDate(t.created_at)} {t.latency_ms ? `| ${t.latency_ms}ms` : ""} | {formatUsd(t.estimated_cost_usd)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="bg-card rounded-lg border border-border lg:min-h-0 overflow-hidden">
          {!selectedTrace ? (
            <div className="p-4 text-sm text-muted">Select a trace to inspect payloads.</div>
          ) : (
            <div className="p-4 space-y-4 max-h-[70vh] lg:max-h-none lg:h-full overflow-y-auto">
              <div>
                <div className="text-sm text-muted">
                  Trace #{selectedTrace.id} | {selectedTrace.endpoint} | {selectedTrace.model ?? "unknown-model"}
                </div>
                <div className="text-sm text-foreground font-semibold">
                  Estimated cost: {formatUsd(selectedTrace.estimated_cost_usd)}
                </div>
              </div>
              {selectedTrace.error && (
                <div className="p-3 rounded-lg bg-[var(--grade-wrong-bg)] text-[var(--grade-wrong-text)] text-sm">
                  {selectedTrace.error}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Cost Calculations</h3>
                <div className="bg-[var(--surface-hover)] rounded-lg border border-border overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-black/5 text-muted-light uppercase tracking-wide">
                      <tr>
                        <th className="text-left p-2 font-semibold">Line Item</th>
                        <th className="text-left p-2 font-semibold">Rate Unit</th>
                        <th className="text-right p-2 font-semibold">Rate</th>
                        <th className="text-right p-2 font-semibold">Units</th>
                        <th className="text-left p-2 font-semibold">Calculation</th>
                        <th className="text-right p-2 font-semibold">Cost (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border/60">
                        <td className="p-2 text-foreground">Input (non-cached)</td>
                        <td className="p-2 text-muted">$ / 1M tokens</td>
                        <td className="p-2 text-right">{formatRate(costBreakdown.input_cost_usd || 0, nonCachedInputTokens, 1_000_000)}</td>
                        <td className="p-2 text-right">{Math.round(nonCachedInputTokens).toLocaleString()} tokens</td>
                        <td className="p-2 text-muted">
                          ({Math.round(nonCachedInputTokens).toLocaleString()} / 1,000,000) x {formatRate(costBreakdown.input_cost_usd || 0, nonCachedInputTokens, 1_000_000)}
                        </td>
                        <td className="p-2 text-right">{formatUsd(costBreakdown.input_cost_usd || 0)}</td>
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="p-2 text-foreground">Input (cached)</td>
                        <td className="p-2 text-muted">$ / 1M tokens</td>
                        <td className="p-2 text-right">{formatRate(costBreakdown.cached_input_cost_usd || 0, cachedInputTokens, 1_000_000)}</td>
                        <td className="p-2 text-right">{Math.round(cachedInputTokens).toLocaleString()} tokens</td>
                        <td className="p-2 text-muted">
                          ({Math.round(cachedInputTokens).toLocaleString()} / 1,000,000) x {formatRate(costBreakdown.cached_input_cost_usd || 0, cachedInputTokens, 1_000_000)}
                        </td>
                        <td className="p-2 text-right">{formatUsd(costBreakdown.cached_input_cost_usd || 0)}</td>
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="p-2 text-foreground">Output (non-reasoning)</td>
                        <td className="p-2 text-muted">$ / 1M tokens</td>
                        <td className="p-2 text-right">{formatRate(costBreakdown.output_cost_usd || 0, nonReasoningOutputTokens, 1_000_000)}</td>
                        <td className="p-2 text-right">{Math.round(nonReasoningOutputTokens).toLocaleString()} tokens</td>
                        <td className="p-2 text-muted">
                          ({Math.round(nonReasoningOutputTokens).toLocaleString()} / 1,000,000) x {formatRate(costBreakdown.output_cost_usd || 0, nonReasoningOutputTokens, 1_000_000)}
                        </td>
                        <td className="p-2 text-right">{formatUsd(costBreakdown.output_cost_usd || 0)}</td>
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="p-2 text-foreground">Output (reasoning)</td>
                        <td className="p-2 text-muted">$ / 1M tokens</td>
                        <td className="p-2 text-right">{formatRate(costBreakdown.reasoning_output_cost_usd || 0, reasoningTokens, 1_000_000)}</td>
                        <td className="p-2 text-right">{Math.round(reasoningTokens).toLocaleString()} tokens</td>
                        <td className="p-2 text-muted">
                          ({Math.round(reasoningTokens).toLocaleString()} / 1,000,000) x {formatRate(costBreakdown.reasoning_output_cost_usd || 0, reasoningTokens, 1_000_000)}
                        </td>
                        <td className="p-2 text-right">{formatUsd(costBreakdown.reasoning_output_cost_usd || 0)}</td>
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="p-2 text-foreground">Web search</td>
                        <td className="p-2 text-muted">$ / call</td>
                        <td className="p-2 text-right">{formatRate(costBreakdown.web_search_cost_usd || 0, webSearchCalls, 1)}</td>
                        <td className="p-2 text-right">{Math.round(webSearchCalls).toLocaleString()} calls</td>
                        <td className="p-2 text-muted">
                          {Math.round(webSearchCalls).toLocaleString()} x {formatRate(costBreakdown.web_search_cost_usd || 0, webSearchCalls, 1)}
                        </td>
                        <td className="p-2 text-right">{formatUsd(costBreakdown.web_search_cost_usd || 0)}</td>
                      </tr>
                      <tr className="border-t border-border/60 bg-black/5">
                        <td className="p-2 text-foreground font-semibold">Total</td>
                        <td className="p-2 text-muted">—</td>
                        <td className="p-2 text-right text-muted">—</td>
                        <td className="p-2 text-right text-muted">—</td>
                        <td className="p-2 text-muted">sum of all line items</td>
                        <td className="p-2 text-right font-semibold text-foreground">
                          {formatUsd(selectedTrace.estimated_cost_usd)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Request</h3>
                <div className="bg-[var(--surface-hover)] rounded-lg border border-border p-3 overflow-auto font-mono text-[11px] leading-4">
                  <JsonTree data={selectedTrace.request_payload || {}} />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Response</h3>
                <div className="bg-[var(--surface-hover)] rounded-lg border border-border p-3 overflow-auto font-mono text-[11px] leading-4">
                  <JsonTree data={selectedTrace.response_payload || {}} />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Usage</h3>
                <div className="bg-[var(--surface-hover)] rounded-lg border border-border p-3 overflow-auto font-mono text-[11px] leading-4">
                  <JsonTree data={selectedTrace.usage || {}} />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
