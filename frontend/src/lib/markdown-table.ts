export type MarkdownAlign = "left" | "right" | "center";

export interface MarkdownTableInput {
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  align?: MarkdownAlign[];
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, "<br />");
}

function alignToken(align: MarkdownAlign): string {
  if (align === "right") return "---:";
  if (align === "center") return ":---:";
  return "---";
}

export function toMarkdownTable(input: MarkdownTableInput): string {
  const { headers, rows, align } = input;
  const width = Math.max(
    headers.length,
    ...rows.map((r) => r.length),
  );
  const normalizedHeaders = Array.from({ length: width }, (_, i) => headers[i] ?? "");
  const normalizedAlign = Array.from({ length: width }, (_, i) => align?.[i] ?? "left");

  const headerRow = `| ${normalizedHeaders.map(escapeCell).join(" | ")} |`;
  const separatorRow = `| ${normalizedAlign.map(alignToken).join(" | ")} |`;
  const bodyRows = rows.map((row) => {
    const normalized = Array.from({ length: width }, (_, i) => row[i] ?? "");
    return `| ${normalized.map(escapeCell).join(" | ")} |`;
  });

  return [headerRow, separatorRow, ...bodyRows].join("\n");
}

export async function copyMarkdownTable(input: MarkdownTableInput): Promise<string> {
  const markdown = toMarkdownTable(input);
  await navigator.clipboard.writeText(markdown);
  return markdown;
}

