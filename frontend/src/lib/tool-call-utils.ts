import type { ToolCall } from "./types";

export type StepKind = "tool" | "web_search";

export interface NormalizedStep {
  kind: StepKind;
  label: string;        // pill display text
  detail: string;       // secondary text for sidebar
  /** For web search: action type */
  actionType?: string;
  /** Original tool call data (for modal content) */
  raw: ToolCall;
}

/** Truncate a URL to hostname + first path segment */
function truncateUrl(url: string, maxLen = 40): string {
  try {
    const u = new URL(url);
    const short = u.hostname + u.pathname;
    return short.length > maxLen ? short.slice(0, maxLen) + "..." : short;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }
}

function truncate(s: string, maxLen = 40): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
}

/**
 * Detect whether a tool call is a web search (supports both new executor and legacy imported formats).
 */
function isWebSearch(tc: ToolCall): boolean {
  if (tc.type === "web_search") return true;
  // Legacy imported format: raw_items.type === "web_search_call"
  if (tc.raw_items && (tc.raw_items as Record<string, unknown>).type === "web_search_call") return true;
  return false;
}

/**
 * Extract web search action details from either format.
 */
function getWebSearchAction(tc: ToolCall): { actionType: string; query?: string; url?: string; pattern?: string; sources?: { url: string }[] } {
  // New executor format
  if (tc.type === "web_search") {
    return {
      actionType: tc.action_type || "search",
      query: tc.query,
      url: tc.url,
      pattern: tc.pattern,
      sources: tc.sources,
    };
  }
  // Legacy format — dig into raw_items.action
  const raw = tc.raw_items as Record<string, unknown> | undefined;
  if (!raw) return { actionType: "search" };
  const action = raw.action as Record<string, unknown> | undefined;
  if (!action) return { actionType: "search" };
  return {
    actionType: (action.type as string) || "search",
    query: action.query as string | undefined,
    url: action.url as string | undefined,
    pattern: action.pattern as string | undefined,
    sources: action.sources as { url: string }[] | undefined,
  };
}

/**
 * Normalize a ToolCall into a NormalizedStep for unified display.
 */
export function normalizeStep(tc: ToolCall): NormalizedStep {
  if (isWebSearch(tc)) {
    const ws = getWebSearchAction(tc);
    let label: string;
    let detail: string;

    if (ws.actionType === "search") {
      label = ws.query ? truncate(ws.query, 48) : "web search";
      detail = "search";
    } else if (ws.actionType === "open_page") {
      label = ws.url ? truncateUrl(ws.url, 48) : "open page";
      detail = "open page";
    } else if (ws.actionType === "find_in_page") {
      label = ws.pattern ? `find "${truncate(ws.pattern, 30)}"` : "find in page";
      detail = ws.url ? truncateUrl(ws.url, 40) : "find in page";
    } else {
      label = "web search";
      detail = ws.actionType;
    }

    return { kind: "web_search", label, detail, actionType: ws.actionType, raw: tc };
  }

  // MCP / function tool call
  return {
    kind: "tool",
    label: tc.name || "unknown",
    detail: tc.name || "unknown",
    raw: tc,
  };
}

/**
 * Normalize all tool calls for a result.
 */
export function normalizeSteps(toolCalls: ToolCall[] | null | undefined): NormalizedStep[] {
  if (!toolCalls?.length) return [];
  return toolCalls.map(normalizeStep);
}

/**
 * Count tool calls and web searches separately.
 */
export function countByKind(toolCalls: ToolCall[] | null | undefined): { tools: number; searches: number } {
  if (!toolCalls?.length) return { tools: 0, searches: 0 };
  let tools = 0;
  let searches = 0;
  for (const tc of toolCalls) {
    if (isWebSearch(tc)) searches++;
    else tools++;
  }
  return { tools, searches };
}
