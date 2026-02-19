"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api/agents";
import type {
  AgentChatResponse,
  ChatMessage,
  ReasoningStep,
  ToolCall,
  TraceLogOut,
  UsageData,
} from "@/lib/types";
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
  focusTraceId?: number | null;
  demoReplayKey?: number;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asReasoningSteps(value: unknown): ReasoningStep[] | undefined {
  return Array.isArray(value) ? (value as ReasoningStep[]) : undefined;
}

function asToolCalls(value: unknown): ToolCall[] | undefined {
  return Array.isArray(value) ? (value as ToolCall[]) : undefined;
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const p = asRecord(part);
        if (!p) return "";
        if (p.type === "text" && typeof p.text === "string") return p.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function traceRequestMessages(requestPayload: unknown, traceId: number): ChatMessageItem[] {
  const payload = asRecord(requestPayload);
  const messages = payload?.messages;
  if (!Array.isArray(messages)) return [];

  const out: ChatMessageItem[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = asRecord(messages[i]);
    if (!msg) continue;
    const role = msg.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = extractMessageText(msg.content);
    if (!content.trim()) continue;
    out.push({
      id: `trace-${traceId}-req-${i}-${role}`,
      role,
      content,
    });
  }
  return out;
}

function extractAssistantResponse(responsePayload: Record<string, unknown> | null): string {
  if (!responsePayload) return "";
  // Direct response field (custom API format)
  if (typeof responsePayload.response === "string") return responsePayload.response;
  // OpenAI chat completions format: choices[0].message.content
  const choices = responsePayload.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = asRecord(choices[0]);
    const msg = first && asRecord(first.message);
    if (msg && typeof msg.content === "string") return msg.content;
  }
  // OpenAI Responses API format: output[].content[].text
  const output = responsePayload.output;
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      const rec = asRecord(item);
      if (!rec) continue;
      if (typeof rec.text === "string") {
        texts.push(rec.text);
      } else if (Array.isArray(rec.content)) {
        for (const part of rec.content) {
          const p = asRecord(part);
          if (p && typeof p.text === "string") texts.push(p.text);
        }
      }
    }
    if (texts.length > 0) return texts.join("\n");
  }
  // assistant_message field
  if (typeof responsePayload.assistant_message === "string") return responsePayload.assistant_message;
  return "";
}

function traceToConversation(trace: TraceLogOut): ChatMessageItem[] {
  const responsePayload = asRecord(trace.response_payload);
  const requestMessages = traceRequestMessages(trace.request_payload, trace.id);
  const assistantResponse = extractAssistantResponse(responsePayload);
  const assistantError = trace.error ? `ERROR: ${trace.error}` : "";
  const assistantContent = assistantResponse || assistantError;
  const toolCalls = asToolCalls(responsePayload?.tool_calls);
  const reasoning = asReasoningSteps(responsePayload?.reasoning);
  const usage = asRecord(trace.usage);

  const out: ChatMessageItem[] = [...requestMessages];
  if (assistantContent) {
    out.push({
      id: `trace-${trace.id}-assistant`,
      role: "assistant",
      content: assistantContent,
      error: trace.error || null,
      meta: {
        tool_calls: toolCalls,
        reasoning,
        usage: usage as UsageData | undefined,
        estimated_cost_usd: trace.estimated_cost_usd,
        cost_breakdown: trace.cost_breakdown || undefined,
        missing_model_pricing: trace.missing_model_pricing,
        trace_log_id: trace.id,
      },
    });
  }
  return out;
}

function reasoningToText(reasoning?: ReasoningStep[]): string {
  if (!Array.isArray(reasoning) || reasoning.length === 0) return "";
  const parts: string[] = [];
  for (const step of reasoning) {
    if (!step) continue;
    if (typeof step.summary === "string") {
      parts.push(step.summary);
    } else if (Array.isArray(step.summary)) {
      for (const item of step.summary) {
        if (typeof item === "string" && item.trim()) parts.push(item);
      }
    }
    if (Array.isArray(step.content)) {
      for (const item of step.content) {
        if (typeof item === "string" && item.trim()) {
          parts.push(item);
          continue;
        }
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          const text = rec.text;
          if (typeof text === "string" && text.trim()) parts.push(text);
        }
      }
    }
  }
  return parts.join("\n\n").trim();
}

function isWideMessageContent(content: string): boolean {
  if (content.includes("```")) return true;
  const hasTableHeader = /\|[^\n]+\|\n\|[\s:-|]+\|/m.test(content);
  if (hasTableHeader) return true;
  return content.length > 1200;
}

function createConversationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function MessageContent({
  content,
  inverted = false,
  className,
}: {
  content: string;
  inverted?: boolean;
  className?: string;
}) {
  const segments = useMemo(() => splitMessageSegments(content), [content]);
  const markdownCls = inverted
    ? "prose prose-sm max-w-none text-white [&_*]:text-white [&_strong]:text-white [&_em]:text-white/95 [&_a]:text-white [&_code]:font-mono [&_code]:text-white [&_code]:bg-white/15 [&_pre]:font-mono [&_pre]:bg-white/10 [&_p]:my-1"
    : undefined;
  const jsonCls = inverted
    ? "jt-root font-mono text-sm leading-relaxed text-white [&_.text-json-key]:text-white [&_.text-json-string]:text-white [&_.text-json-number]:text-white [&_.text-json-bool]:text-white [&_.text-json-null]:text-white"
    : "jt-root font-mono text-sm leading-relaxed";

  return (
    <div className={`space-y-2 ${className || ""}`.trim()}>
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

export function AgentChatView({
  agentId,
  agentName,
  focusTraceId = null,
  demoReplayKey = 0,
}: Props) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyHiddenByAgent, setHistoryHiddenByAgent] = useState<Record<number, boolean>>({});
  const [toolModal, setToolModal] = useState<{ toolCalls: ToolCall[]; idx: number } | null>(null);
  const [detailsModal, setDetailsModal] = useState<ChatMessageItem | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [chatZoom, setChatZoom] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const thinkingBodyRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const shouldAutoScrollThinkingRef = useRef(true);
  const suppressMainScrollHandlerRef = useRef(false);
  const suppressThinkingScrollHandlerRef = useRef(false);
  const demoRunIdRef = useRef(0);
  const demoPausedRef = useRef(false);
  const lastDemoReplayKeyRef = useRef(0);
  const agentIdRef = useRef(agentId);
  const isHistoryHidden = !!historyHiddenByAgent[agentId];

  const {
    data: chatTraces = [],
    isLoading: isHistoryLoading,
    error: historyLoadError,
  } = useQuery({
    queryKey: ["agent-chat-history", agentId],
    queryFn: () =>
      agentsApi.listTraces(agentId, {
        traceType: "chat",
        limit: 1000,
      }),
  });

  const activeHistoryTrace = useMemo(() => {
    if (!chatTraces.length) return null;
    if (focusTraceId != null) {
      const exact = chatTraces.find((t) => t.id === focusTraceId);
      if (exact) return exact;
    }
    return chatTraces[0] || null;
  }, [chatTraces, focusTraceId]);

  const historyConversationId = activeHistoryTrace?.conversation_id || null;

  const historyMessages = useMemo(() => {
    if (!activeHistoryTrace) return [];
    return traceToConversation(activeHistoryTrace);
  }, [activeHistoryTrace]);

  const renderedMessages = messages.length > 0 ? messages : isHistoryHidden ? [] : historyMessages;

  const stopDemo = useCallback(() => {
    demoRunIdRef.current += 1;
    demoPausedRef.current = false;
    setIsDemoRunning(false);
    setInput("");
  }, []);

  const replayDemoFromHistory = useCallback(async () => {
    if (isStreaming || isDemoRunning) return;
    const source = historyMessages.filter((m) => !m.pending && !!m.content?.trim());
    if (!source.length) return;

    const runId = demoRunIdRef.current + 1;
    demoRunIdRef.current = runId;
    const isCancelled = () => demoRunIdRef.current !== runId;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });
    const waitWhilePaused = async () => {
      while (demoPausedRef.current && !isCancelled()) {
        await wait(60);
      }
    };
    const waitWithControls = async (ms: number) => {
      let remaining = ms;
      while (remaining > 0 && !isCancelled()) {
        await waitWhilePaused();
        if (isCancelled()) break;
        const step = Math.min(remaining, 60);
        await wait(step);
        remaining -= step;
      }
    };
    const randomInt = (min: number, max: number) =>
      min + Math.floor(Math.random() * (max - min + 1));
    const demoTiming = {
      userTyping: { chunkMin: 1, chunkMax: 2, delayMin: 24, delayMax: 58 },
      thinking: { chunkMin: 2, chunkMax: 6, delayMin: 4, delayMax: 12 },
      assistant: { chunkMin: 2, chunkMax: 7, delayMin: 5, delayMax: 14 },
    };

    const streamText = async (
      text: string,
      applyChunk: (chunk: string) => void,
      chunkMin: number,
      chunkMax: number,
      delayMin: number,
      delayMax: number,
    ) => {
      let idx = 0;
      while (idx < text.length) {
        await waitWhilePaused();
        if (isCancelled()) return;
        const chunkSize = Math.min(text.length - idx, randomInt(chunkMin, chunkMax));
        const chunk = text.slice(idx, idx + chunkSize);
        applyChunk(chunk);
        idx += chunkSize;
        await waitWithControls(randomInt(delayMin, delayMax));
      }
    };
    const waitForHumanStep = async (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        if (isCancelled()) {
          resolve(false);
          return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key.toLowerCase() !== "n") return;
          event.preventDefault();
          cleanup(true);
        };
        const timer = window.setInterval(() => {
          if (isCancelled()) cleanup(false);
        }, 80);
        const cleanup = (startTyping: boolean) => {
          window.removeEventListener("keydown", onKeyDown);
          window.clearInterval(timer);
          resolve(startTyping);
        };
        window.addEventListener("keydown", onKeyDown);
      });

    setIsDemoRunning(true);
    setHistoryHiddenByAgent((prev) => ({ ...prev, [agentId]: true }));
    setMessages([]);
    setInput("");
    shouldAutoScrollRef.current = true;
    shouldAutoScrollThinkingRef.current = true;

    try {
      for (let i = 0; i < source.length; i += 1) {
        if (isCancelled()) break;
        const turn = source[i];

        if (turn.role === "user") {
          const shouldType = await waitForHumanStep();
          if (!shouldType || isCancelled()) break;
          let typed = "";
          await streamText(
            turn.content,
            (chunk) => {
              typed += chunk;
              setInput(typed);
            },
            demoTiming.userTyping.chunkMin,
            demoTiming.userTyping.chunkMax,
            demoTiming.userTyping.delayMin,
            demoTiming.userTyping.delayMax,
          );
          if (isCancelled()) break;
          await waitWithControls(140);
          setMessages((prev) => [
            ...prev,
            {
              id: `demo-${runId}-${i}-user`,
              role: "user",
              content: turn.content,
            },
          ]);
          setInput("");
          await waitWithControls(210);
          continue;
        }

        const pendingId = `demo-${runId}-${i}-assistant-pending`;
        const reasoningText = reasoningToText(turn.meta?.reasoning);

        setMessages((prev) => [
          ...prev,
          {
            id: pendingId,
            role: "assistant",
            content: "",
            pending: true,
            pending_status: null,
            pending_events: [],
            pending_reasoning: "",
            meta: {
              ...turn.meta,
              reasoning: turn.meta?.reasoning ? [{ summary: [""] }] : undefined,
            },
          },
        ]);

        if (reasoningText) {
          await streamText(
            reasoningText,
            (chunk) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingId
                    ? {
                        ...m,
                        pending_status: "thinking",
                        pending_events: ["thinking"],
                        pending_reasoning: `${m.pending_reasoning || ""}${chunk}`,
                        meta: {
                          ...m.meta,
                          reasoning: [{ summary: [`${m.pending_reasoning || ""}${chunk}`] }],
                        },
                      }
                    : m
                )
              );
            },
            demoTiming.thinking.chunkMin,
            demoTiming.thinking.chunkMax,
            demoTiming.thinking.delayMin,
            demoTiming.thinking.delayMax,
          );
          if (isCancelled()) break;
          await waitWithControls(180);
        }

        await streamText(
          turn.content,
          (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId
                  ? {
                      ...m,
                      content: `${m.content || ""}${chunk}`,
                    }
                  : m
              )
            );
          },
          demoTiming.assistant.chunkMin,
          demoTiming.assistant.chunkMax,
          demoTiming.assistant.delayMin,
          demoTiming.assistant.delayMax,
        );
        if (isCancelled()) break;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  pending: false,
                  pending_status: null,
                  pending_events: [],
                  pending_reasoning: "",
                  content: turn.content,
                  error: turn.error || null,
                  meta: turn.meta,
                }
              : m
          )
        );
        await waitWithControls(260);
      }
    } finally {
      if (demoRunIdRef.current === runId) {
        demoPausedRef.current = false;
        setIsDemoRunning(false);
        setInput("");
      }
    }
  }, [agentId, historyMessages, isDemoRunning, isStreaming]);

  useEffect(() => {
    return () => {
      demoRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);

  useEffect(() => {
    setActiveConversationId(null);
  }, [agentId, focusTraceId]);

  useEffect(() => {
    if (focusTraceId == null) return;
    stopDemo();
    setHistoryHiddenByAgent((prev) => ({ ...prev, [agentId]: false }));
    setMessages([]);
    shouldAutoScrollRef.current = true;
    shouldAutoScrollThinkingRef.current = true;
  }, [focusTraceId, agentId, stopDemo]);

  useEffect(() => {
    if (demoReplayKey <= 0) return;
    if (!activeHistoryTrace) return;
    if (isStreaming || isDemoRunning) return;
    const consumedKeyName = `agent-chat-demo-consumed-${agentIdRef.current}`;
    let consumedKey = lastDemoReplayKeyRef.current;
    if (typeof window !== "undefined") {
      const stored = Number(sessionStorage.getItem(consumedKeyName) || "0");
      if (!Number.isNaN(stored)) consumedKey = Math.max(consumedKey, stored);
    }
    if (demoReplayKey <= consumedKey) return;
    lastDemoReplayKeyRef.current = demoReplayKey;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(consumedKeyName, String(demoReplayKey));
    }
    void replayDemoFromHistory();
  }, [demoReplayKey, activeHistoryTrace, isStreaming, isDemoRunning, replayDemoFromHistory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "5") return;
      event.preventDefault();
      if (isDemoRunning) {
        stopDemo();
        return;
      }
      if (!activeHistoryTrace || isStreaming) return;
      void replayDemoFromHistory();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeHistoryTrace, isDemoRunning, isStreaming, replayDemoFromHistory, stopDemo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isDemoRunning) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      demoPausedRef.current = !demoPausedRef.current;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDemoRunning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const isPlusKey = event.key === "+" || event.key === "=";
      const isMinusKey = event.key === "-" || event.key === "_" || event.key === "Subtract";
      if (!isPlusKey && !isMinusKey) return;
      event.preventDefault();
      if (isPlusKey) {
        setChatZoom((prev) => Math.min(2, Number((prev + 0.1).toFixed(2))));
      } else {
        setChatZoom((prev) => Math.max(0.8, Number((prev - 0.1).toFixed(2))));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const chatZoomStyle = chatZoom === 1 ? undefined : { zoom: chatZoom };

  const isNearBottom = (el: HTMLDivElement, threshold = 96) => {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= threshold;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = messagesRef.current;
    if (!el) return;
    suppressMainScrollHandlerRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
    window.setTimeout(() => {
      suppressMainScrollHandlerRef.current = false;
    }, behavior === "smooth" ? 220 : 40);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(`agent-chat-${agentId}`);
  }, [agentId]);

  const lastMessage = renderedMessages[renderedMessages.length - 1];
  const streamingContent = lastMessage?.pending
    ? (lastMessage.content || "") + (lastMessage.pending_reasoning || "")
    : null;
  const streamingReasoning = lastMessage?.pending ? (lastMessage.pending_reasoning || "") : "";

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    scrollToBottom(streamingContent ? "auto" : "smooth");
  }, [renderedMessages.length, streamingContent]);

  useEffect(() => {
    const isThinkingStream = !!lastMessage?.pending && !lastMessage?.content && !!streamingReasoning.trim();
    if (!isThinkingStream) {
      shouldAutoScrollThinkingRef.current = true;
      return;
    }
    if (!shouldAutoScrollThinkingRef.current) return;
    const el = thinkingBodyRef.current;
    if (!el) return;
    suppressThinkingScrollHandlerRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    window.setTimeout(() => {
      suppressThinkingScrollHandlerRef.current = false;
    }, 40);
  }, [lastMessage?.id, lastMessage?.pending, lastMessage?.content, streamingReasoning]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      shouldAutoScrollRef.current = true;
      scrollToBottom("auto");
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
    if (!text || isStreaming || isDemoRunning) return;
    const conversationId =
      activeConversationId ||
      (!isHistoryHidden ? historyConversationId : null) ||
      createConversationId();
    const baseMessages = renderedMessages;
    setActiveConversationId(conversationId);
    setHistoryHiddenByAgent((prev) => ({ ...prev, [agentId]: true }));
    shouldAutoScrollRef.current = true;
    shouldAutoScrollThinkingRef.current = true;
    const pendingId = `assistant-pending-${Date.now()}`;
    const next = [
      ...baseMessages,
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
        const fallback = await agentsApi.chat(agentId, payload, conversationId);
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

      const res = await agentsApi.chatStream(agentId, payload, conversationId);
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

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    if (suppressMainScrollHandlerRef.current) return;
    shouldAutoScrollRef.current = isNearBottom(el, 80);
  };

  const handleThinkingScroll = () => {
    const el = thinkingBodyRef.current;
    if (!el) return;
    if (suppressThinkingScrollHandlerRef.current) return;
    shouldAutoScrollThinkingRef.current = isNearBottom(el, 16);
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
              stopDemo();
              setActiveConversationId(createConversationId());
              setHistoryHiddenByAgent((prev) => ({ ...prev, [agentId]: true }));
              shouldAutoScrollRef.current = true;
              shouldAutoScrollThinkingRef.current = true;
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

      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleMessagesScroll}
        onWheel={(event) => {
          if (event.deltaY < 0) shouldAutoScrollRef.current = false;
        }}
      >
        <div
          className={
            isExpanded
              ? "mx-auto w-full max-w-[980px] px-10 py-8 space-y-4"
              : "mx-auto w-full px-8 py-6 lg:px-10 lg:py-7 space-y-4"
          }
          style={chatZoomStyle}
        >
          {renderedMessages.length === 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted">
                {isHistoryLoading
                  ? "Loading chat history..."
                  : historyLoadError
                    ? "Couldn't load chat history. You can still start a new chat."
                    : "No messages yet."}
              </div>
            </div>
          )}
          {renderedMessages.map((m) => {
            const hasPendingReasoning = !!m.pending && !m.content && !!m.pending_reasoning?.trim();
            const isCompactPending = !!m.pending && !m.content && !m.pending_reasoning?.trim();

            return (
              <div key={m.id} className="space-y-2">
                <div
                  className={
                    m.role === "user"
                      ? "ml-auto w-fit max-w-[72%] rounded-2xl px-3.5 py-1.5 text-sm bg-primary text-primary-foreground"
                      : `${m.content && isWideMessageContent(m.content) ? "max-w-[92%]" : hasPendingReasoning ? "max-w-[82%] w-full" : "max-w-[74%]"} chat-assistant-bubble rounded-2xl ${
                          isCompactPending ? "px-3 py-1.5" : hasPendingReasoning ? "p-2.5" : "px-4 py-2.5"
                        } text-sm text-foreground ${
                          m.pending && !hasPendingReasoning ? "w-fit" : ""
                        }`
                  }
                >
                  {m.pending ? (
                    <div className="space-y-0.5">
                      {m.content ? (
                        <MessageContent content={m.content} inverted={m.role === "user"} />
                      ) : hasPendingReasoning ? (
                        <div className="chat-thinking-panel">
                          <div className="chat-thinking-panel-header">
                            <div className="chat-thinking-summary-label text-[11px] font-semibold">
                              <span className="chat-thinking-summary-dot" aria-hidden="true" />
                              <span className="chat-thinking-summary-title">Thinking</span>
                              <span className="chat-thinking-summary-ellipsis" aria-hidden="true">
                                <span>.</span>
                                <span>.</span>
                                <span>.</span>
                              </span>
                            </div>
                          </div>
                          <div
                            ref={thinkingBodyRef}
                            className="chat-thinking-panel-body"
                            onScroll={handleThinkingScroll}
                            onWheel={(event) => {
                              if (event.deltaY < 0) shouldAutoScrollThinkingRef.current = false;
                            }}
                          >
                            <MessageContent
                              content={m.pending_reasoning || ""}
                              inverted={m.role === "user"}
                              className="chat-thinking-summary"
                            />
                          </div>
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
            );
          })}
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
        <div
          className={isExpanded ? "relative flex items-center mx-auto max-w-[980px]" : "relative flex items-center"}
          style={chatZoomStyle}
        >
          <input
            type="text"
            className="w-full h-10 rounded-full border border-border bg-[var(--surface)] pl-4 pr-12 text-sm text-foreground outline-none"
            placeholder="Type a message..."
            value={input}
            readOnly={isDemoRunning}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (isDemoRunning) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            className="absolute right-1.5 w-7 h-7 rounded-full bg-foreground text-background inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            onClick={sendMessage}
            disabled={isStreaming || isDemoRunning || !input.trim()}
            title={isDemoRunning ? "Demo mode running" : isStreaming ? "Streaming..." : "Send"}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
