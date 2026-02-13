import { apiFetch, apiUrl } from "./client";
import type {
  AgentChatResponse,
  AgentCreate,
  AgentOut,
  AgentUpdate,
  ChatMessage,
  TraceLogOut,
} from "../types";

export const agentsApi = {
  list: (tag?: string) =>
    apiFetch<AgentOut[]>(`/api/agents${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`),

  get: (id: number) =>
    apiFetch<AgentOut>(`/api/agents/${id}`),

  create: (body: AgentCreate) =>
    apiFetch<AgentOut>("/api/agents", { method: "POST", body: JSON.stringify(body) }),

  update: (id: number, body: AgentUpdate) =>
    apiFetch<AgentOut>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  delete: (id: number) =>
    apiFetch<void>(`/api/agents/${id}`, { method: "DELETE" }),

  parseCode: (code: string) =>
    apiFetch<Record<string, unknown>>("/api/agents/parse-code", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  chat: (id: number, messages: ChatMessage[]) =>
    apiFetch<AgentChatResponse>(`/api/agents/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),

  chatStream: (id: number, messages: ChatMessage[]) =>
    fetch(apiUrl(`/api/agents/${id}/chat/stream`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }),

  listTraces: (
    id: number,
    params?: { status?: string; traceType?: string; runId?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.traceType) qs.set("trace_type", params.traceType);
    if (params?.runId !== undefined) qs.set("run_id", String(params.runId));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiFetch<TraceLogOut[]>(
      `/api/agents/${id}/traces${query ? `?${query}` : ""}`
    );
  },
};
