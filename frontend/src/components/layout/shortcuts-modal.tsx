"use client";

import { useState, useEffect } from "react";

const shortcuts = [
  ["Navigation", [
    ["j", "Previous query"],
    ["k", "Next query"],
    [".", "Scroll to top"],
  ]],
  ["Agent Tabs", [
    ["Tab", "Next agent tab"],
    ["Shift+Tab", "Previous agent tab"],
    ["Shift+Click", "Split compare view"],
  ]],
  ["Grading", [
    ["y / c", "Grade correct"],
    ["p", "Grade partial"],
    ["w / n", "Grade wrong"],
    ["e", "Toggle edit grades"],
  ]],
  ["Other", [
    ["Cmd/Ctrl+K", "Open command palette"],
    ["t", "Toggle tool calls"],
    ["m", "Toggle grade bar"],
    ["?", "Show shortcuts"],
    ["Esc", "Close modal"],
  ]],
] as const;

export function ShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "?") {
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="bg-card rounded-xl border border-border shadow-[0_16px_64px_rgba(0,0,0,0.24)] p-5 w-96" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-[13px] font-semibold text-foreground">Keyboard Shortcuts</h3>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground text-lg leading-none">&times;</button>
        </div>
        <div className="space-y-3.5">
          {shortcuts.map(([section, keys]) => (
            <div key={section as string}>
              <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">{section as string}</h4>
              <div className="space-y-0.5">
                {(keys as readonly (readonly [string, string])[]).map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-muted">{desc}</span>
                    <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--surface)] border border-border text-[10px] font-mono font-medium text-foreground">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
