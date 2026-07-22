import type { LlmProvider } from "src/domain/types.js";

export interface ParsedByLlm {
  data: unknown;
  provider: LlmProvider;
}

/**
 * Common interface so bot/parse.ts doesn't need to know which LLM actually answered —
 * see fallbackParser.ts (C5, D10) for the Claude-primary/Gemini-fallback composition.
 */
export interface LLMParser {
  parse(rawText: string): Promise<ParsedByLlm>;
}
