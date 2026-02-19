"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api/agents";
import { JsonTree } from "@/components/json/json-tree";
import type { TraceLogOut } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  agentId: number;
  onOpenInChat?: (traceId: number) => void;
}

export function AgentTracesView({ agentId, onOpenInChat }: Props) {
  const [status, setStatus] = useState<string>("all");
  const [traceType, setTraceType] = useState<string>("all");
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);

  const { data: traces = [], isLoading, refetch } = useQuery({
    queryKey: ["agent-traces", agentId, status, traceType],
    queryFn: () =>
      agentsApi.listTraces(agentId, {
        status: status === "all" ? undefined : status,
        traceType: traceType === "all" ? undefined : traceType,
        limit: 300,
      }),
  });

  const selectedTrace: TraceLogOut | undefined =
    traces.find((t) => t.id === selectedTraceId) ?? traces[0];
  const formatUsd = (amount: number): string => `$${amount.toFixed(4)}`;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="border-r border-border flex flex-col min-h-0">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <select
            value={traceType}
            onChange={(e) => setTraceType(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-[var(--surface)] border border-border text-foreground outline-none"
          >
            <option value="all">All types</option>
            <option value="benchmark">benchmark</option>
            <option value="retry">retry</option>
            <option value="chat">chat</option>
            <option value="preview">preview</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-[var(--surface)] border border-border text-foreground outline-none"
          >
            <option value="all">All status</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="started">started</option>
          </select>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground"
          >
            Refresh
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
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
                  (selectedTrace?.id ?? null) === t.id && "bg-primary/10"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">Trace #{t.id}</div>
                  <span className="text-[11px] text-muted">{t.trace_type}</span>
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {t.status} | run {t.run_id ?? "-"} | query {t.query_id ?? "-"}
                </div>
                <div className="text-xs text-muted-light mt-0.5">
                  {formatDate(t.created_at)} | {formatUsd(t.estimated_cost_usd)}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto p-4">
        {!selectedTrace ? (
          <div className="text-sm text-muted">Select a trace to inspect payloads.</div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-foreground font-semibold">
              Trace #{selectedTrace.id} | {selectedTrace.trace_type} | {selectedTrace.status}
            </div>
            {onOpenInChat && selectedTrace.trace_type === "chat" && (
              <button
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:brightness-110"
                onClick={() => onOpenInChat(selectedTrace.id)}
              >
                Open in Chat
              </button>
            )}
            {selectedTrace.error && (
              <div className="p-3 rounded-lg bg-[var(--grade-wrong-bg)] text-[var(--grade-wrong-text)] text-sm">
                {selectedTrace.error}
              </div>
            )}
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
  );
}
