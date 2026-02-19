"use client";

import type { ToolCall } from "@/lib/types";
import { normalizeSteps } from "@/lib/tool-call-utils";
import { cn } from "@/lib/utils";

interface Props {
  toolCalls: ToolCall[] | null;
  onClickTool: (idx: number) => void;
}

const kindStyles = {
  tool: "bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)] hover:bg-primary hover:text-primary-foreground",
  web_search: "glass-pill text-muted-light hover:text-foreground",
};

export function ToolPills({ toolCalls, onClickTool }: Props) {
  const steps = normalizeSteps(toolCalls);
  if (!steps.length) return null;

  return (
    <div className="text-xs text-muted mt-1.5 p-1.5 px-2.5 bg-card rounded-lg border border-border/60 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.06)] break-words">
      {steps.map((step, i) => (
        <span
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            onClickTool(i);
          }}
          className={cn(
            "inline-block px-1.5 py-0.5 m-0.5 rounded text-xs font-semibold cursor-pointer transition-all hover:-translate-y-px hover:shadow-md",
            kindStyles[step.kind],
          )}
          title={step.kind === "web_search" ? step.detail : step.label}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}
