import type { ToolCall, ReasoningStep } from "./types";

/** Extract all searchable text from a tool call. */
export function getSearchText(tc: ToolCall): string {
  let text = "";
  // MCP tool call data
  if (tc.arguments) {
    try {
      const parsed = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : tc.arguments;
      text += JSON.stringify(parsed);
    } catch { text += String(tc.arguments); }
  }
  if (tc.response) {
    try {
      const parsed = typeof tc.response === "string" ? JSON.parse(tc.response) : tc.response;
      text += " " + JSON.stringify(parsed);
    } catch { text += " " + String(tc.response); }
  }
  // Web search data (new format)
  if (tc.query) text += " " + tc.query;
  if (tc.url) text += " " + tc.url;
  if (tc.pattern) text += " " + tc.pattern;
  if (tc.sources) text += " " + JSON.stringify(tc.sources);
  // Legacy format
  if (tc.raw_items) text += " " + JSON.stringify(tc.raw_items);
  return text;
}

/** Count non-overlapping occurrences of `ql` (already lowercased) in `text`. */
export function countMatches(text: string, ql: string): number {
  if (!ql) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  let pos = lower.indexOf(ql);
  while (pos >= 0) {
    count++;
    pos = lower.indexOf(ql, pos + ql.length);
  }
  return count;
}

/** Extract all searchable text from a reasoning step. */
export function getReasoningSearchText(step: ReasoningStep): string {
  let text = "";
  if (step.summary) {
    if (Array.isArray(step.summary)) {
      text += step.summary.join(" ");
    } else {
      text += step.summary;
    }
  }
  if (step.content) {
    for (const c of step.content) {
      if (typeof c === "string") {
        text += " " + c;
      } else {
        text += " " + JSON.stringify(c);
      }
    }
  }
  return text;
}
