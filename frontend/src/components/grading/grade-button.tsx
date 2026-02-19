"use client";

import { cn } from "@/lib/utils";
import type { GradeValue } from "@/lib/types";

interface Props {
  grade: GradeValue;
  active: boolean;
  onClick: () => void;
}

const config: Record<
  GradeValue,
  { label: string; icon: string; idle: string; active: string }
> = {
  correct: {
    label: "Correct",
    icon: "\u2713",
    idle: "border-border text-muted hover:border-grade-correct-border hover:text-grade-correct-text",
    active:
      "bg-grade-correct-bg border-grade-correct-border text-grade-correct-text",
  },
  partial: {
    label: "Partial",
    icon: "~",
    idle: "border-border text-muted hover:border-grade-partial-border hover:text-grade-partial-text",
    active:
      "bg-grade-partial-bg border-grade-partial-border text-grade-partial-text",
  },
  wrong: {
    label: "Wrong",
    icon: "\u2717",
    idle: "border-border text-muted hover:border-grade-wrong-border hover:text-grade-wrong-text",
    active: "bg-grade-wrong-bg border-grade-wrong-border text-grade-wrong-text",
  },
};

export function GradeButton({ grade, active, onClick }: Props) {
  const c = config[grade];
  return (
    <button
      className={cn(
        "px-2.5 py-1 border rounded-md cursor-pointer font-semibold transition-all text-xs",
        active ? c.active : c.idle,
      )}
      onClick={onClick}
    >
      {c.icon} {c.label}
    </button>
  );
}
