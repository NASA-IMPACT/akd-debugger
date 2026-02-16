import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  className?: string;
}

export function Checkbox({ checked, indeterminate, onChange, className }: CheckboxProps) {
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={cn(
        "inline-flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors shrink-0",
        active
          ? "bg-primary border-primary text-primary-foreground"
          : "border-border bg-transparent hover:border-muted",
        className,
      )}
    >
      {indeterminate ? <Minus size={10} strokeWidth={3} /> : checked ? <Check size={10} strokeWidth={3} /> : null}
    </button>
  );
}
