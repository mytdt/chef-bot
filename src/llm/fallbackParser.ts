import { isRetryableClaudeError } from "src/llm/claudeClient.js";
import type { LLMParser } from "src/llm/llmParser.js";

/**
 * C5/D10: Gemini is only ever a fallback, not a substitute — it's tried exactly once,
 * only when the primary (Claude) fails with a retryable error (timeout, 5xx, 429). Any
 * other error from Claude (or any error from Gemini itself) is not retried further.
 */
export function createFallbackParser(primary: LLMParser, fallback: LLMParser): LLMParser {
  return {
    async parse(rawText: string) {
      try {
        return await primary.parse(rawText);
      } catch (error) {
        if (!isRetryableClaudeError(error)) {
          throw error;
        }
        return fallback.parse(rawText);
      }
    },
  };
}
