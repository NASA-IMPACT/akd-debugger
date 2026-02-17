"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { agentsApi } from "@/lib/api/agents";
import type { AgentChatResponse, ChatMessage, ReasoningStep, ToolCall, UsageData } from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { JsonTree } from "@/components/json/json-tree";
import { ToolPills } from "@/components/tool-calls/tool-pills";
import { ToolModal } from "@/components/tool-calls/tool-modal";
import { ReasoningDisplay } from "@/components/grading/reasoning-display";
import { UsageSummary } from "@/components/usage/usage-summary";
import { ArrowUp, Maximize2, Minimize2 } from "lucide-react";

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
  agentName?: string;
}

type MessageSegment =
  | { type: "markdown"; content: string }
  | { type: "json"; data: unknown };

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function splitMessageSegments(content: string): MessageSegment[] {
  const fenceRegex = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;
  const chunks: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const lang = (match[1] || "").toLowerCase();
    const body = (match[2] || "").trim();
    const start = match.index;

    if (start > lastIndex) {
      chunks.push({ type: "markdown", content: content.slice(lastIndex, start) });
    }

    const looksJson = body.startsWith("{") || body.startsWith("[");
    const parsed = (lang === "json" || looksJson) ? tryParseJson(body) : null;
    if (parsed !== null) {
      chunks.push({ type: "json", data: parsed });
    } else {
      chunks.push({ type: "markdown", content: fullMatch });
    }

    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < content.length) {
    chunks.push({ type: "markdown", content: content.slice(lastIndex) });
  }

  if (chunks.length === 0) {
    const parsedWhole = tryParseJson(content.trim());
    if (parsedWhole !== null) return [{ type: "json", data: parsedWhole }];
    return [{ type: "markdown", content }];
  }

  return chunks.filter((chunk) => chunk.type === "json" || chunk.content.trim().length > 0);
}

function isWideMessageContent(content: string): boolean {
  if (content.includes("```")) return true;
  const hasTableHeader = /\|[^\n]+\|\n\|[\s:-|]+\|/m.test(content);
  if (hasTableHeader) return true;
  return content.length > 1200;
}

function MessageContent({ content, inverted = false }: { content: string; inverted?: boolean }) {
  const segments = useMemo(() => splitMessageSegments(content), [content]);
  const markdownCls = inverted
    ? "prose prose-sm max-w-none text-white [&_*]:text-white [&_strong]:text-white [&_em]:text-white/95 [&_a]:text-white [&_code]:font-mono [&_code]:text-white [&_code]:bg-white/15 [&_pre]:font-mono [&_pre]:bg-white/10 [&_p]:my-1"
    : undefined;
  const jsonCls = inverted
    ? "jt-root font-mono text-sm leading-relaxed text-white [&_.text-json-key]:text-white [&_.text-json-string]:text-white [&_.text-json-number]:text-white [&_.text-json-bool]:text-white [&_.text-json-null]:text-white"
    : "jt-root font-mono text-sm leading-relaxed";

  return (
    <div className="space-y-2">
      {segments.map((segment, idx) =>
        segment.type === "json" ? (
          <div key={`json-${idx}`} className={jsonCls}>
            <JsonTree data={segment.data} defaultOpen maxOpenDepth={2} />
          </div>
        ) : (
          <MarkdownRenderer key={`md-${idx}`} content={segment.content} className={markdownCls} />
        )
      )}
    </div>
  );
}

export function AgentChatView({ agentId, agentName }: Props) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [toolModal, setToolModal] = useState<{ toolCalls: ToolCall[]; idx: number } | null>(null);
  const [detailsModal, setDetailsModal] = useState<ChatMessageItem | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(`agent-chat-${agentId}`);
  }, [agentId]);

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

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExpanded]);

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
      let doneEmitted = false;
      let sawStreamEvent = false;

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

      const applyCompletedPayload = (data: Partial<AgentChatResponse>) => {
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
            cost_breakdown: data.cost_breakdown || undefined,
            missing_model_pricing: data.missing_model_pricing,
            trace_log_id: data.trace_log_id,
          },
        }));
      };

      const runNonStreamingFallback = async () => {
        const fallback = await agentsApi.chat(agentId, payload);
        applyCompletedPayload(fallback);
      };

      const handleEvent = (eventType: string, dataRaw: string) => {
        let data: Record<string, unknown> = {};
        if (dataRaw) {
          try {
            data = JSON.parse(dataRaw) as Record<string, unknown>;
          } catch {
            data = {};
          }
        }
        if (eventType === "text_delta") {
          const delta = String(data.delta || "");
          updatePending((m) => ({
            ...m,
            content: (m.content || "") + delta,
          }));
        } else if (
          eventType === "reasoning_delta" ||
          eventType === "summary_delta" ||
          eventType === "reasoning_summary_delta"
        ) {
          const delta = String(data.delta || data.summary || data.text || "");
          if (!delta) return;
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
          applyCompletedPayload(data as Partial<AgentChatResponse>);
        } else if (eventType === "error") {
          throw new Error(String(data.error || "Streaming error"));
        }
      };

      const res = await agentsApi.chatStream(agentId, payload);
      if (!res.ok) {
        if (res.status === 404 || res.status === 405 || res.status === 501) {
          await runNonStreamingFallback();
          return;
        }
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `API error ${res.status}`);
      }
      if (!res.body) {
        await runNonStreamingFallback();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processRawEvent = (rawEvent: string) => {
        if (!rawEvent.trim()) return;
        sawStreamEvent = true;
        let eventType = "message";
        const dataLines: string[] = [];
        rawEvent.split(/\r?\n/).forEach((line) => {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        });
        const dataRaw = dataLines.join("\n");
        handleEvent(eventType, dataRaw);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let match = buffer.match(/\r?\n\r?\n/);
        while (match) {
          const idx = match.index ?? -1;
          if (idx < 0) break;
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + match[0].length);
          processRawEvent(rawEvent);
          match = buffer.match(/\r?\n\r?\n/);
        }
      }

      const tail = decoder.decode();
      if (tail) buffer += tail;
      if (buffer.trim()) {
        processRawEvent(buffer.trim());
      }

      if (!doneEmitted) {
        updatePending((m) => ({
          ...m,
          pending: false,
          pending_status: null,
          pending_events: [],
          content:
            !sawStreamEvent && !m.content
              ? "ERROR: Stream ended before a final response."
              : m.content,
          error:
            !sawStreamEvent && !m.content
              ? "Stream ended before a final response."
              : m.error || null,
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
    <>
    {isExpanded && (
      <div
        className="fixed inset-0 z-[980] bg-black/40"
        onClick={() => setIsExpanded(false)}
        aria-hidden="true"
      />
    )}
    <div
      className={
        isExpanded
          ? "fixed inset-4 z-[1000] flex flex-col rounded-xl border border-border bg-card shadow-2xl"
          : "h-full flex flex-col"
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold text-foreground">
          {agentName ? `Chat with ${agentName}` : "Chat (session only)"}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface)] border border-border text-muted hover:text-foreground inline-flex items-center gap-1.5"
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? "Collapse chat" : "Expand chat"}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {isExpanded ? "Collapse" : "Expand"}
          </button>
          <button
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface)] border border-border text-muted hover:text-foreground"
            onClick={() => {
              setMessages([]);
              setInput("");
              setToolModal(null);
              setDetailsModal(null);
            }}
          >
            New chat
          </button>
        </div>
      </div>

      <div ref={messagesRef} className="flex-1 overflow-y-auto">
        <div
          className={
            isExpanded
              ? "mx-auto w-full max-w-[980px] px-10 py-8 space-y-4"
              : "mx-auto w-full px-8 py-6 lg:px-10 lg:py-7 space-y-4"
          }
        >
          {messages.length === 0 && (
            <div className="text-sm text-muted">No messages yet.</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="space-y-2">
              <div
                className={
                  m.role === "user"
                    ? "ml-auto w-fit max-w-[72%] rounded-2xl px-3.5 py-1.5 text-sm bg-primary text-primary-foreground"
                    : `${m.content && isWideMessageContent(m.content) ? "max-w-[92%]" : "max-w-[74%]"} chat-assistant-bubble rounded-2xl ${
                        m.pending && !m.content && !m.pending_reasoning ? "px-3 py-1.5" : "px-4 py-2.5"
                      } text-sm text-foreground ${
                        m.pending ? "w-fit" : ""
                      }`
                }
              >
                {m.pending ? (
                  <div className="space-y-0.5">
                    {m.content ? (
                      <MessageContent content={m.content} inverted={m.role === "user"} />
                    ) : m.pending_reasoning?.trim() ? (
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-muted-light">Thinking summary</div>
                        <MessageContent content={m.pending_reasoning} inverted={m.role === "user"} />
                      </div>
                    ) : (
                      (() => {
                        const recent = (m.pending_events || []).slice(-3);
                        const activeAction =
                          m.pending_status || recent[recent.length - 1] || "";
                        const showActiveStatus =
                          !!activeAction &&
                          activeAction.trim().toLowerCase() !== "thinking";
                        const history = recent
                          .filter((evt, idx) => !(evt === activeAction && idx === recent.length - 1))
                          .slice(-2);
                        return (
                          <>
                            {!!history.length && (
                              <div className="text-[11px] text-muted-light space-y-0.5">
                                {history.map((evt, i) => (
                                  <div key={`${m.id}-evt-${i}`}>• {evt}</div>
                                ))}
                              </div>
                            )}
                            {showActiveStatus && (
                              <div className="text-[11px] text-muted-light">{activeAction}</div>
                            )}
                            <div className="chat-thinking-gradient text-[14px] font-semibold">Thinking</div>
                          </>
                        );
                      })()
                    )}
                  </div>
                ) : (
                  <MessageContent content={m.content} inverted={m.role === "user"} />
                )}
              </div>
              {m.role === "assistant" && !m.pending && m.meta && (
              <button
                className="text-xs text-muted hover:text-foreground font-semibold"
                onClick={() => setDetailsModal(m)}
              >
                Show thinking
              </button>
            )}
            </div>
          ))}
        </div>
      </div>

      {toolModal && (
        <ToolModal
          toolCalls={toolModal.toolCalls}
          initialIdx={toolModal.idx}
          queryLabel="Agent chat"
          zIndex={1200}
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
          <div className="bg-card border border-border rounded-xl w-[95%] max-w-[980px] max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b border-border px-6 py-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Assistant details</h3>
              <button
                onClick={() => setDetailsModal(null)}
                className="text-2xl leading-none text-muted hover:text-foreground hover:bg-[var(--surface-hover)] rounded-md px-2 py-0.5"
                aria-label="Close assistant details"
              >
                &times;
              </button>
            </div>

            <div className="px-6 pt-4 pb-6">
            <div className="mb-4">
              <div className="text-sm font-semibold text-foreground mb-2">Response</div>
              <div className="max-w-none rounded-lg border border-border bg-[var(--surface)] p-3 text-sm">
                <MessageContent content={detailsModal.content || "No assistant text was returned."} />
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
        </div>
      )}

      <div className={isExpanded ? "px-8 py-4 border-t border-border" : "px-6 py-4 border-t border-border"}>
        <div className={isExpanded ? "relative flex items-center mx-auto max-w-[980px]" : "relative flex items-center"}>
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
    </>
  );
}
