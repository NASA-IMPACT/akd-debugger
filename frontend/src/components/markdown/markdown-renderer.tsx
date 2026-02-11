"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string | null;
}

export function MarkdownRenderer({ content }: Props) {
  if (!content) return null;

  // Replace literal \n sequences with actual newlines so markdown parses correctly
  const normalized = content.replace(/\\n/g, "\n");

  return (
    <div className="prose prose-sm max-w-none text-foreground [&_pre]:bg-[var(--surface-hover)] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_code]:bg-[var(--surface-hover)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-[var(--surface-hover)] [&_th]:px-3 [&_th]:py-1.5 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_p]:my-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalized}</ReactMarkdown>
    </div>
  );
}
