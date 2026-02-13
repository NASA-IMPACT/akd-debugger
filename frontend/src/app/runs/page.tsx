"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReasoningDisplay } from "@/components/grading/reasoning-display";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ToolModal } from "@/components/tool-calls/tool-modal";
import { ToolPills } from "@/components/tool-calls/tool-pills";
import { UsageSummary } from "@/components/usage/usage-summary";
import { runsApi } from "@/lib/api/runs";
import { tracesApi } from "@/lib/api/traces";
import type { ReasoningStep, ToolCall } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function ElapsedTime({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor((now - new Date(since).getTime()) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <span>{m > 0 ? `${m}m ${s}s` : `${s}s`}</span>;
}

export default function RunningJobsPage() {
  const [mode, setMode] = useState<"active" | "past">("active");
  const [selectedRetryTraceId, setSelectedRetryTraceId] = useState<number | null>(null);
  const [activeRunsCollapsed, setActiveRunsCollapsed] = useState(false);
  const [activeRetriesCollapsed, setActiveRetriesCollapsed] = useState(false);
  const [pastRetriesCollapsed, setPastRetriesCollapsed] = useState(false);
  const [pastRunsCollapsed, setPastRunsCollapsed] = useState(false);
  const [toolModal, setToolModal] = useState<{ toolCalls: ToolCall[]; idx: number } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["running-jobs"],
    queryFn: () => runsApi.listJobs(),
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
  });
  const { data: allRuns = [], isLoading: loadingPastRuns } = useQuery({
    queryKey: ["runs-all"],
    queryFn: () => runsApi.list(),
  });
  const { data: retryTraces = [], isLoading: loadingPastRetries } = useQuery({
    queryKey: ["retry-traces-all"],
    queryFn: () => tracesApi.list({ traceType: "retry", limit: 300 }),
  });
  const { data: selectedRetryTrace } = useQuery({
    queryKey: ["retry-trace-detail", selectedRetryTraceId],
    queryFn: () => tracesApi.get(selectedRetryTraceId!),
    enabled: selectedRetryTraceId !== null,
    refetchInterval: (query) => {
      const trace = query.state.data;
      return trace?.status === "started" ? 2000 : false;
    },
  });
  const { data: selectedRetryRun } = useQuery({
    queryKey: ["retry-trace-run", selectedRetryTrace?.run_id],
    queryFn: () => runsApi.get(selectedRetryTrace!.run_id!),
    enabled: !!selectedRetryTrace?.run_id,
  });

  const jobs = data || { runs: [], cost_previews: [], single_queries: [] };
  const activeTotal = jobs.runs.length + jobs.single_queries.length;
  const pastRuns = useMemo(
    () => allRuns.filter((r) => !["pending", "running"].includes(r.status)),
    [allRuns]
  );
  const pastRetries = useMemo(
    () => retryTraces.filter((t) => t.status !== "started"),
    [retryTraces]
  );
  const pastTotal = pastRuns.length + pastRetries.length;
  const isLoadingPast = loadingPastRuns || loadingPastRetries;
  const responsePayload = (selectedRetryTrace?.response_payload || {}) as Record<string, unknown>;
  const retryResponse = String(responsePayload.response || selectedRetryTrace?.error || "N/A");
  const retryToolCalls = Array.isArray(responsePayload.tool_calls)
    ? (responsePayload.tool_calls as ToolCall[])
    : null;
  const retryReasoning = Array.isArray(responsePayload.reasoning)
    ? (responsePayload.reasoning as ReasoningStep[])
    : null;

  useEffect(() => {
    if (!selectedRetryTraceId || toolModal) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedRetryTraceId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedRetryTraceId, toolModal]);

  return (
    <>
      <PageHeader
        title="Runs"
        subtitle={<div className="text-sm text-muted mt-1">Track active and past benchmark runs, previews, and retries</div>}
      >
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm"
        >
          Refresh
        </button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${mode === "active" ? "bg-primary text-primary-foreground" : "bg-[var(--surface)] border border-border text-muted hover:text-foreground"}`}
          onClick={() => setMode("active")}
        >
          Active ({activeTotal})
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${mode === "past" ? "bg-primary text-primary-foreground" : "bg-[var(--surface)] border border-border text-muted hover:text-foreground"}`}
          onClick={() => setMode("past")}
        >
          Past ({pastTotal})
        </button>
      </div>

      {mode === "active" ? (
        <div className="space-y-4">
          <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-3 border-b border-border font-semibold text-sm text-left flex items-center justify-between hover:bg-[var(--surface-hover)] transition-colors"
              onClick={() => setActiveRunsCollapsed((v) => !v)}
              aria-expanded={!activeRunsCollapsed}
            >
              <span>Benchmark Runs</span>
              {activeRunsCollapsed ? <ChevronRight size={16} className="text-muted" aria-hidden="true" /> : <ChevronDown size={16} className="text-muted" aria-hidden="true" />}
            </button>
            {!activeRunsCollapsed && (
              <>
                {isLoading ? (
                  <div className="p-4 text-sm text-muted">Loading...</div>
                ) : jobs.runs.length === 0 ? (
                  <div className="p-4 text-sm text-muted">No benchmark runs in progress.</div>
                ) : (
                  jobs.runs.map((job) => (
                    <div key={`run-${job.id}`} className="px-4 py-3 border-b last:border-b-0 border-border/70 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{job.label}</div>
                        <div className="text-xs text-muted">
                          {job.status} | agent {job.agent_name || "-"} | dataset {job.suite_name || "-"}
                        </div>
                      </div>
                      <Link className="text-xs text-brand no-underline hover:underline" href={`/runs/${job.id}`}>
                        Open
                      </Link>
                    </div>
                  ))
                )}
              </>
            )}
          </section>

          <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-3 border-b border-border font-semibold text-sm text-left flex items-center justify-between hover:bg-[var(--surface-hover)] transition-colors"
              onClick={() => setActiveRetriesCollapsed((v) => !v)}
              aria-expanded={!activeRetriesCollapsed}
            >
              <span>Single Query Retries</span>
              {activeRetriesCollapsed ? <ChevronRight size={16} className="text-muted" aria-hidden="true" /> : <ChevronDown size={16} className="text-muted" aria-hidden="true" />}
            </button>
            {!activeRetriesCollapsed && (
              <>
                {isLoading ? (
                  <div className="p-4 text-sm text-muted">Loading...</div>
                ) : jobs.single_queries.length === 0 ? (
                  <div className="p-4 text-sm text-muted">No single-query retries currently running.</div>
                ) : (
                  jobs.single_queries.map((job) => (
                    <div key={`retry-${job.id}`} className="px-4 py-3 border-b last:border-b-0 border-border/70">
                      <div className="text-sm font-semibold text-foreground">{job.label}</div>
                      <div className="text-xs text-muted">
                        status {job.status} | run {job.run_id ?? "-"} | query {job.query_id ?? "-"} | started {job.started_at ? formatDate(job.started_at) : "-"}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-3 border-b border-border font-semibold text-sm text-left flex items-center justify-between hover:bg-[var(--surface-hover)] transition-colors"
              onClick={() => setPastRetriesCollapsed((v) => !v)}
              aria-expanded={!pastRetriesCollapsed}
            >
              <span>Past Single Query Retries</span>
              {pastRetriesCollapsed ? <ChevronRight size={16} className="text-muted" aria-hidden="true" /> : <ChevronDown size={16} className="text-muted" aria-hidden="true" />}
            </button>
            {!pastRetriesCollapsed && (
              <>
                {isLoadingPast ? (
                  <div className="p-4 text-sm text-muted">Loading...</div>
                ) : pastRetries.length === 0 ? (
                  <div className="p-4 text-sm text-muted">No past single-query retries found.</div>
                ) : (
                  pastRetries.slice(0, 200).map((trace) => (
                    <button
                      key={`past-retry-${trace.id}`}
                      className="w-full text-left px-4 py-3 border-b last:border-b-0 border-border/70 hover:bg-[var(--surface-hover)] transition-colors"
                      onClick={() => setSelectedRetryTraceId(trace.id)}
                    >
                      <div className="text-sm font-semibold text-foreground">Retry trace #{trace.id}</div>
                      <div className="text-xs text-muted">
                        {trace.status} | run {trace.run_id ?? "-"} | query {trace.query_id ?? "-"} | {formatDate(trace.created_at)}
                      </div>
                    </button>
                  ))
                )}
              </>
            )}
          </section>

          <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-3 border-b border-border font-semibold text-sm text-left flex items-center justify-between hover:bg-[var(--surface-hover)] transition-colors"
              onClick={() => setPastRunsCollapsed((v) => !v)}
              aria-expanded={!pastRunsCollapsed}
            >
              <span>Past Benchmark Runs</span>
              {pastRunsCollapsed ? <ChevronRight size={16} className="text-muted" aria-hidden="true" /> : <ChevronDown size={16} className="text-muted" aria-hidden="true" />}
            </button>
            {!pastRunsCollapsed && (
              <>
                {isLoadingPast ? (
                  <div className="p-4 text-sm text-muted">Loading...</div>
                ) : pastRuns.length === 0 ? (
                  <div className="p-4 text-sm text-muted">No past benchmark runs found.</div>
                ) : (
                  pastRuns.slice(0, 200).map((run) => (
                    <div key={`past-run-${run.id}`} className="px-4 py-3 border-b last:border-b-0 border-border/70 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{run.label}</div>
                        <div className="text-xs text-muted">
                          {run.status} | agent {run.agent_name} | dataset {run.suite_name} | {formatDate(run.created_at)}
                        </div>
                      </div>
                      <Link className="text-xs text-brand no-underline hover:underline" href={`/runs/${run.id}`}>
                        Open
                      </Link>
                    </div>
                  ))
                )}
              </>
            )}
          </section>
        </div>
      )}

      {selectedRetryTraceId && selectedRetryTrace && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRetryTraceId(null);
          }}
        >
          <div className="bg-card border border-border rounded-xl w-[95%] max-w-[980px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-semibold">Retry Trace #{selectedRetryTrace.id}</h3>
              <button
                className="text-sm px-3 py-1.5 bg-[var(--surface-hover)] border border-border rounded-lg"
                onClick={() => setSelectedRetryTraceId(null)}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
              <div className="p-3 rounded-lg border border-border bg-[var(--surface-hover)]">
                <div className="text-xs text-muted-light">Status</div>
                <div className="font-semibold">{selectedRetryTrace.status}</div>
              </div>
              <div className="p-3 rounded-lg border border-border bg-[var(--surface-hover)]">
                <div className="text-xs text-muted-light">Created</div>
                <div className="font-semibold">{formatDate(selectedRetryTrace.created_at)}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
              {selectedRetryRun?.agent_config_id ? (
                <Link
                  href={`/agents/${selectedRetryRun.agent_config_id}?tab=traces`}
                  className="text-brand no-underline hover:underline"
                >
                  Agent: {selectedRetryRun.agent_name}
                </Link>
              ) : (
                <span className="text-muted">Agent: -</span>
              )}
              {selectedRetryRun?.suite_id ? (
                <Link
                  href={`/datasets/${selectedRetryRun.suite_id}`}
                  className="text-brand no-underline hover:underline"
                >
                  Dataset: {selectedRetryRun.suite_name}
                </Link>
              ) : (
                <span className="text-muted">Dataset: -</span>
              )}
              {selectedRetryTrace.run_id ? (
                <Link
                  href={`/runs/${selectedRetryTrace.run_id}`}
                  className="text-brand no-underline hover:underline"
                >
                  Benchmark Run #{selectedRetryTrace.run_id}
                </Link>
              ) : (
                <span className="text-muted">Benchmark: -</span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-foreground mb-1.5">Query</div>
                <div className="p-3 rounded-lg border border-border bg-[var(--surface-hover)] text-sm whitespace-pre-wrap">
                  {String((selectedRetryTrace.request_payload || {}).query || "N/A")}
                </div>
              </div>

              {selectedRetryTrace.status === "started" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-brand/30 bg-brand/5">
                    <Loader2 size={20} className="animate-spin text-brand shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">Running...</div>
                      <div className="text-xs text-muted">
                        Elapsed: <ElapsedTime since={selectedRetryTrace.started_at} />
                        {" "}&middot; Model: {selectedRetryTrace.model || "unknown"}
                      </div>
                    </div>
                  </div>
                  {(selectedRetryTrace.request_payload as Record<string, unknown>)?.system_prompt && (
                    <div>
                      <div className="text-sm font-semibold text-foreground mb-1.5">System Prompt</div>
                      <div className="p-3 rounded-lg border border-border bg-[var(--surface-hover)] text-xs text-muted max-h-[120px] overflow-y-auto whitespace-pre-wrap">
                        {String((selectedRetryTrace.request_payload as Record<string, unknown>).system_prompt).slice(0, 500)}
                        {String((selectedRetryTrace.request_payload as Record<string, unknown>).system_prompt).length > 500 ? "..." : ""}
                      </div>
                    </div>
                  )}
                  {(selectedRetryTrace.request_payload as Record<string, unknown>)?.tools_config && (
                    <div>
                      <div className="text-sm font-semibold text-foreground mb-1.5">Tools</div>
                      <div className="p-3 rounded-lg border border-border bg-[var(--surface-hover)] text-xs text-muted">
                        {(() => {
                          const tc = (selectedRetryTrace.request_payload as Record<string, unknown>).tools_config;
                          const list = Array.isArray(tc) ? tc : [tc];
                          return list.map((t: Record<string, unknown>, i: number) => (
                            <span key={i} className="inline-block mr-2 px-2 py-0.5 rounded bg-[var(--surface)] border border-border text-xs">
                              {String(t?.type || "tool")}
                              {t?.server_label ? `: ${t.server_label}` : ""}
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-1.5">Response</div>
                    <div className="p-3 rounded-lg border border-border bg-[var(--surface-hover)] text-sm">
                      <MarkdownRenderer content={retryResponse} className="prose prose-sm max-w-none text-foreground [&_p]:my-1" />
                    </div>
                  </div>
                  <ToolPills
                    toolCalls={retryToolCalls}
                    onClickTool={(idx) => {
                      if (!retryToolCalls?.length) return;
                      setToolModal({ toolCalls: retryToolCalls, idx });
                    }}
                  />

                  <ReasoningDisplay reasoning={retryReasoning} />

                  <UsageSummary
                    usage={selectedRetryTrace.usage as Record<string, unknown> | undefined}
                    estimatedCostUsd={selectedRetryTrace.estimated_cost_usd}
                    missingModelPricing={selectedRetryTrace.missing_model_pricing}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {toolModal && (
        <ToolModal
          toolCalls={toolModal.toolCalls}
          initialIdx={toolModal.idx}
          queryLabel={selectedRetryTrace ? `Retry Trace #${selectedRetryTrace.id}` : "Retry Trace"}
          onClose={() => setToolModal(null)}
        />
      )}
    </>
  );
}
