import { detectLanguage } from "./detect-language";
import { parseTypescriptAgentCode } from "./ts-agent-parser";
import { agentsApi } from "../api/agents";

/**
 * Unified entry point for parsing agent code.
 * TypeScript is parsed on the frontend; Python is sent to the backend.
 */
export async function parseAgentCode(code: string): Promise<Record<string, unknown>> {
  const lang = detectLanguage(code);
  if (lang === "typescript") {
    return parseTypescriptAgentCode(code);
  }
  // Python: delegate to backend
  return agentsApi.parseCode(code);
}
