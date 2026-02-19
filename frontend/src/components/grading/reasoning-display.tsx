"use client";

import type { ReasoningStep } from "@/lib/types";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

interface Props {
  reasoning: ReasoningStep[] | null;
}

export function ReasoningDisplay({ reasoning }: Props) {
  if (!reasoning?.length) return null;

  return (
    <details className="mt-2 border border-border rounded-lg overflow-hidden">
      <summary className="px-3 py-1.5 bg-[var(--surface)] font-semibold text-xs cursor-pointer select-none text-muted hover:bg-[var(--surface-hover)]">
        Reasoning ({reasoning.length} step{reasoning.length > 1 ? "s" : ""})
      </summary>
      <div className="p-2 max-h-[500px] overflow-y-auto">
        {reasoning.map((step, i) => (
          <div
            key={i}
            className="border-l-[3px] border-[var(--tag-purple-text)] pl-3 py-2 mb-2 bg-[var(--tag-purple-bg)] rounded-r-md"
          >
            {step.summary &&
              (Array.isArray(step.summary) ? (
                step.summary.map((s, j) => (
                  <div key={j} className="text-sm text-foreground/80">
                    <MarkdownRenderer content={s} />
                  </div>
                ))
              ) : (
                <div className="text-sm text-foreground/80">
                  <MarkdownRenderer content={step.summary} />
                </div>
              ))}
            {step.content?.map((c, j) =>
              typeof c === "string" ? (
                <div key={j} className="text-sm text-foreground/80">
                  <MarkdownRenderer content={c} />
                </div>
              ) : null,
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
