"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { agentsApi } from "@/lib/api/agents";
import type { ChatMessage, ReasoningStep, ToolCall, UsageData } from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ToolPills } from "@/components/tool-calls/tool-pills";
import { ToolModal } from "@/components/tool-calls/tool-modal";
import { ReasoningDisplay } from "@/components/grading/reasoning-display";
import { UsageSummary } from "@/components/usage/usage-summary";
import { ArrowUp } from "lucide-react";

interface MessageMeta {
  tool_calls?: ToolCall[];
  reasoning?: ReasoningStep[];
  usage?: UsageData;
  estimated_cost_usd?: number;
  cost_breakdown?: Record<string, number>;
  missing_model_pricing?: boolean;
  trace_log_id?: number | null;
}

interface ChatMessageItem extends ChatMessage {
  id: string;
  meta?: MessageMeta;
  error?: string | null;
  pending?: boolean;
  pending_status?: string | null;
  pending_events?: string[];
  pending_reasoning?: string;
}

interface Props {
  agentId: number;
}

export function AgentChatView({ agentId }: Props) {
  const storageKey = useMemo(() => `agent-chat-${agentId}`, [agentId]);
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(`agent-chat-${agentId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ChatMessageItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m, idx) => ({
        id: m.id || `restored-${idx}-${Date.now()}`,
        role: m.role,
        content: m.content,
        meta: m.meta,
        error: m.error,
        pending: false,
        pending_status: null,
        pending_events: [],
        pending_reasoning: "",
      }));
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [toolModal, setToolModal] = useState<{ toolCalls: ToolCall[]; idx: number } | null>(null);
  const [detailsModal, setDetailsModal] = useState<ChatMessageItem | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(messages));
  }, [storageKey, messages]);

  const lastMessage = messages[messages.length - 1];
  const streamingContent = lastMessage?.pending
    ? (lastMessage.content || "") + (lastMessage.pending_reasoning || "")
    : null;

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, streamingContent]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const el = messagesRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const pendingId = `assistant-pending-${Date.now()}`;
    const next = [
      ...messages,
      { id: `user-${Date.now()}`, role: "user" as const, content: text },
      {
        id: pendingId,
        role: "assistant" as const,
        content: "",
        pending: true,
        pending_status: null,
        pending_events: [],
        pending_reasoning: "",
      },
    ];
    setMessages(next);
    setInput("");
    setIsStreaming(true);

    try {
      const payload = next
        .filter((m) => !m.pending)
        .map(({ role, content }) => ({ role, content }));
      const res = await agentsApi.chatStream(agentId, payload);
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `API error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneEmitted = false;

      const updatePending = (fn: (current: ChatMessageItem) => ChatMessageItem) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingId ? fn(m) : m))
        );
      };

      const appendEvent = (m: ChatMessageItem, eventText: string): string[] => {
        const prev = m.pending_events || [];
        if (prev[prev.length - 1] === eventText) return prev;
        return [...prev.slice(-4), eventText];
      };

      const handleEvent = (eventType: string, dataRaw: string) => {
        const data = dataRaw ? JSON.parse(dataRaw) : {};
        if (eventType === "text_delta") {
          const delta = String(data.delta || "");
          updatePending((m) => ({
            ...m,
            content: (m.content || "") + delta,
          }));
        } else if (eventType === "reasoning_delta") {
          const delta = String(data.delta || "");
          updatePending((m) => {
            const prevReasoning = m.meta?.reasoning || [];
            const first = prevReasoning[0];
            const prevText =
              first && Array.isArray(first.summary) ? String(first.summary[0] || "") : "";
            return {
              ...m,
              pending_status: "thinking",
              pending_events: appendEvent(m, "thinking"),
              pending_reasoning: `${m.pending_reasoning || ""}${delta}`,
              meta: {
                ...m.meta,
                reasoning: [{ summary: [prevText + delta] }],
              },
            };
          });
        } else if (eventType === "tool_call") {
          const name = String(data.name || "tool");
          const status = String(data.status || "tool_called");
          updatePending((m) => ({
            ...m,
            pending_status: `${status}: ${name}`,
            pending_events: appendEvent(m, `${status}: ${name}`),
          }));
        } else if (eventType === "done") {
          doneEmitted = true;
          updatePending((m) => ({
            ...m,
            pending: false,
            pending_status: null,
            pending_events: [],
            pending_reasoning: "",
            content: data.assistant_message || m.content || "",
            error: data.error || null,
            meta: {
              tool_calls: data.tool_calls || undefined,
              reasoning: data.reasoning || m.meta?.reasoning || undefined,
              usage: data.usage || undefined,
              estimated_cost_usd: data.estimated_cost_usd,
              cost_breakdown: data.cost_breakdown,
              missing_model_pricing: data.missing_model_pricing,
              trace_log_id: data.trace_log_id,
            },
          }));
        } else if (eventType === "error") {
          throw new Error(String(data.error || "Streaming error"));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const rawEvent = buffer.slice(0, idx).trim();
          const delim = buffer.match(/\r?\n\r?\n/);
          buffer = buffer.slice(idx + (delim ? delim[0].length : 2));
          if (!rawEvent) continue;
          let eventType = "message";
          const dataLines: string[] = [];
          rawEvent.split(/\r?\n/).forEach((line) => {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          });
          const dataRaw = dataLines.join("\n");
          handleEvent(eventType, dataRaw);
        }
      }

      if (!doneEmitted) {
        updatePending((m) => ({
          ...m,
          pending: false,
          pending_status: null,
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Streaming failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? {
                ...m,
                pending: false,
                pending_status: null,
                pending_events: [],
                pending_reasoning: "",
                content: `ERROR: ${message}`,
                error: message,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold text-foreground">Chat (session only)</div>
        <button
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface)] border border-border text-muted hover:text-foreground"
          onClick={() => setMessages([])}
        >
          Clear Session
        </button>
      </div>

      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted">No messages yet.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <div
              className={
                m.role === "user"
                  ? "ml-auto w-fit max-w-[65%] rounded-xl px-3 py-2 text-sm bg-primary text-primary-foreground"
                  : `max-w-[65%] rounded-xl px-3 py-2 text-sm bg-[var(--surface)] border border-border text-foreground ${
                      m.pending ? "w-fit" : ""
                    }`
              }
            >
              {m.pending ? (
                <div className="space-y-1">
                  {m.content ? (
                    <MarkdownRenderer content={m.content} />
                  ) : (
                    <>
                      {!!m.pending_events?.length && (
                        <div className="text-[11px] text-muted-light space-y-0.5">
                          {m.pending_events.slice(-3).map((evt, i) => (
                            <div key={`${m.id}-evt-${i}`}>• {evt}</div>
                          ))}
                        </div>
                      )}
                      {m.pending_status && (
                        <div className="text-[11px] text-muted-light">{m.pending_status}</div>
                      )}
                      {!m.pending_status && !m.pending_events?.length && (
                        <div className="inline-flex items-end gap-1 text-muted">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:120ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:240ms]" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <MarkdownRenderer content={m.content} />
              )}
            </div>
            {m.role === "assistant" && !m.pending && m.meta && (
              <button
                className="text-xs text-muted hover:text-foreground font-semibold"
                onClick={() => setDetailsModal(m)}
              >
                Expand more
              </button>
            )}
          </div>
        ))}
      </div>

      {toolModal && (
        <ToolModal
          toolCalls={toolModal.toolCalls}
          initialIdx={toolModal.idx}
          queryLabel="Agent chat"
          onClose={() => setToolModal(null)}
        />
      )}

      {detailsModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailsModal(null);
          }}
        >
          <div className="bg-card border border-border rounded-xl w-[95%] max-w-[980px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">Assistant details</h3>
              <button
                className="text-sm px-3 py-1.5 bg-[var(--surface-hover)] border border-border rounded-lg"
                onClick={() => setDetailsModal(null)}
              >
                Close
              </button>
            </div>

            <div className="mb-4">
              <div className="text-sm font-semibold text-foreground mb-2">Response</div>
              <div className="max-w-none rounded-lg border border-border bg-[var(--surface)] p-3 text-sm">
                <MarkdownRenderer content={detailsModal.content || "No assistant text was returned."} />
              </div>
            </div>

            <div className="space-y-3">
              <ToolPills
                toolCalls={detailsModal.meta?.tool_calls || null}
                onClickTool={(idx) => {
                  if (!detailsModal.meta?.tool_calls?.length) return;
                  setToolModal({ toolCalls: detailsModal.meta.tool_calls, idx });
                }}
              />

              <ReasoningDisplay reasoning={detailsModal.meta?.reasoning || null} />

              <UsageSummary
                usage={detailsModal.meta?.usage as Record<string, unknown> | undefined}
                estimatedCostUsd={detailsModal.meta?.estimated_cost_usd}
                missingModelPricing={detailsModal.meta?.missing_model_pricing}
                traceLogId={detailsModal.meta?.trace_log_id}
              />
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border">
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full h-10 rounded-full border border-border bg-[var(--surface)] pl-4 pr-12 text-sm text-foreground outline-none"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            className="absolute right-1.5 w-7 h-7 rounded-full bg-foreground text-background inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            title={isStreaming ? "Streaming..." : "Send"}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
