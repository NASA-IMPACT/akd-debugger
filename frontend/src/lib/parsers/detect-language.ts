/**
 * Detect whether pasted code is Python or TypeScript.
 */
export function detectLanguage(code: string): "python" | "typescript" {
  const lines = code.split("\n");

  let tsScore = 0;
  let pyScore = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // TypeScript / JavaScript signals
    if (/^import\s+\{/.test(trimmed)) tsScore += 2;
    if (/^import\s+\w+\s+from\s+/.test(trimmed)) tsScore += 2;
    if (/^export\s+(const|function|default|class)\s/.test(trimmed)) tsScore += 2;
    if (/\bnew\s+Agent\s*\(/.test(trimmed)) tsScore += 3;
    if (/=>\s*\{/.test(trimmed)) tsScore += 1;
    if (/:\s*(string|number|boolean|Record|Array)\b/.test(trimmed)) tsScore += 1;
    if (/^(const|let|var)\s+\w+/.test(trimmed)) tsScore += 1;

    // Python signals
    if (/^from\s+\S+\s+import\s+/.test(trimmed)) pyScore += 2;
    if (/^import\s+\w+$/.test(trimmed)) pyScore += 2;
    if (/^def\s+\w+\s*\(/.test(trimmed)) pyScore += 2;
    if (/^class\s+\w+[\s(:]/.test(trimmed)) pyScore += 2;
    if (/\bAgent\s*\(/.test(trimmed) && !/\bnew\s+Agent/.test(trimmed)) pyScore += 1;
    if (/^\s*@\w+/.test(trimmed)) pyScore += 1;
    if (/:\s*$/.test(trimmed) && /^(if|for|while|def|class|with|try|except)\b/.test(trimmed)) pyScore += 1;
  }

  return tsScore > pyScore ? "typescript" : "python";
}
