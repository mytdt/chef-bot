import type Anthropic from "@anthropic-ai/sdk";
import { requestStructuredParse } from "src/llm/claudeClient.js";
import { countParseSchema, type ParsedCount } from "src/bot/parse.schema.js";

/**
 * Every LLM output passes through here before touching business logic — if the JSON
 * comes back malformed, this fails explicitly instead of proceeding with invalid data
 * (D1 relies on the collaborator seeing and confirming exactly what was parsed).
 */
export async function parseCountText(client: Anthropic, rawText: string): Promise<ParsedCount> {
  const raw = await requestStructuredParse(client, rawText);
  const result = countParseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`LLM parse failed Zod validation: ${result.error.message}`);
  }
  return result.data;
}
