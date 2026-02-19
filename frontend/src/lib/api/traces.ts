import { apiFetch } from "./client";
import type { TraceLogOut, TraceSummaryOut } from "../types";

export const tracesApi = {
  list: (params?: { runId?: number; status?: string; traceType?: string; agentConfigId?: number; conversationId?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.runId !== undefined) qs.set("run_id", String(params.runId));
    if (params?.status) qs.set("status", params.status);
    if (params?.traceType) qs.set("trace_type", params.traceType);
    if (params?.agentConfigId !== undefined) qs.set("agent_config_id", String(params.agentConfigId));
    if (params?.conversationId) qs.set("conversation_id", params.conversationId);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiFetch<TraceLogOut[]>(`/api/traces${query ? `?${query}` : ""}`);
  },

  summary: (params?: { runId?: number; status?: string; traceType?: string; agentConfigId?: number; conversationId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.runId !== undefined) qs.set("run_id", String(params.runId));
    if (params?.status) qs.set("status", params.status);
    if (params?.traceType) qs.set("trace_type", params.traceType);
    if (params?.agentConfigId !== undefined) qs.set("agent_config_id", String(params.agentConfigId));
    if (params?.conversationId) qs.set("conversation_id", params.conversationId);
    const query = qs.toString();
    return apiFetch<TraceSummaryOut>(`/api/traces/summary${query ? `?${query}` : ""}`);
  },

  get: (id: number) => apiFetch<TraceLogOut>(`/api/traces/${id}`),
};
