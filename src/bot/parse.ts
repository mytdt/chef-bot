import type { LLMParser } from "src/llm/llmParser.js";
import type { LlmProvider } from "src/domain/types.js";
import { countParseSchema, type ParsedCount } from "src/bot/parse.schema.js";

export interface ParsedCountResult {
  parse: ParsedCount;
  llmUsed: LlmProvider;
}

/**
 * Every LLM output passes through here before touching business logic — if the JSON
 * comes back malformed, this fails explicitly instead of proceeding with invalid data
 * (D1 relies on the collaborator seeing and confirming exactly what was parsed). The
 * same Zod schema validates the output regardless of which provider answered (C5).
 */
export async function parseCountText(llmParser: LLMParser, rawText: string): Promise<ParsedCountResult> {
  const { data, provider } = await llmParser.parse(rawText);
  const result = countParseSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`LLM parse failed Zod validation: ${result.error.message}`);
  }
  return { parse: result.data, llmUsed: provider };
}
