"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const defaultCls = "prose prose-sm max-w-none text-foreground [&_pre]:font-mono [&_pre]:bg-[var(--surface-hover)] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:bg-[var(--surface-hover)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_p]:my-1";

interface Props {
  content: string | null;
  className?: string;
}

export function MarkdownRenderer({ content, className }: Props) {
  if (!content) return null;

  // Replace literal \n sequences with actual newlines so markdown parses correctly
  let normalized = content.replace(/\\n/g, "\n");
  // Ensure blank line before list items and headings so markdown parses them as blocks
  normalized = normalized.replace(/([^\n])\n([-*+] )/g, "$1\n\n$2");
  normalized = normalized.replace(/([^\n])\n(\d+\. )/g, "$1\n\n$2");
  normalized = normalized.replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2");

  return (
    <div className={className ?? defaultCls}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className }) {
            const isBlock = Boolean(className);
            return (
              <code
                className={`${className || ""} font-mono ${isBlock ? "text-sm leading-relaxed" : "rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-sm"}`.trim()}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto rounded-md border border-border">
                <table className="min-w-[760px] w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border bg-[var(--surface-hover)] px-3 py-2 text-left font-semibold align-top">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-border px-3 py-2 align-top break-words">
                {children}
              </td>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
