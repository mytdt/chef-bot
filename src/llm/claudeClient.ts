import Anthropic from "@anthropic-ai/sdk";
import type { LLMParser } from "src/llm/llmParser.js";

const MODEL = "claude-sonnet-5";

export function createClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

// B3 bot integration: today's date is interpolated in so the model can resolve "hoje"
// (or no date mentioned at all, the common case) to an actual YYYY-MM-DD — the model
// has no other way to know what day it is right now.
function buildSystemPrompt(todayIso: string): string {
  return `You interpret free-text stock count messages from an employee at a burger restaurant
(Burgers category), sent via Telegram. Real messages always have TWO location sections —
MEZANINO and COZINHA — each with a slash-separated list of "quantity + supply token", e.g.:

ATUALIZAÇÃO DAS CARNES
MEZANINO
857 G / 836 F / 330 W / 0 CHORI / 9 PCT CHICKEN / 20 PCT VEGETARIANO
COZINHA
160 G / 112 F / 7 W / 5 VEGETARIANO / 11 CHORI / 8 PCT CHICKEN / 6 CHICKEN SESSÃO

Extract BOTH locations. For each line:
- supplyRaw: the supply token exactly as written (e.g. "G", "PCT CHICKEN", "CHICKEN SESSÃO") — do not normalize or translate.
- quantity: the number before the token.
- unitKind: "package" if the line has PCT or CX; otherwise "unit".
Do NOT multiply package quantities, do NOT sum locations, do NOT merge "PCT CHICKEN" with "CHICKEN SESSÃO".

If the employee explicitly mentions the actual total quantity of a variable-quantity package
(e.g., "opened the chicken package and it had 8.5" / "real foram 170"), fill in actualQuantity
on that line; otherwise leave it null. Do not invent items that aren't in the text.

Today's date is ${todayIso} (YYYY-MM-DD). The message may mention which day the count is for (e.g.,
"contagem de ontem", "22/07"); resolve it to YYYY-MM-DD format. If no date is mentioned, use today's
date — most counts are for the current day.

Optional: if the message includes a free-text explanation of a prior divergence (usually a line
starting with "Motivo:" / "motivo:"), put that explanation in the top-level "motivo" field.
If there is no such explanation, omit "motivo" or set it to null. Do not invent a motivo.`;
}

const PARSE_TOOL = {
  name: "record_count_items",
  description: "Records the structured locations/lines extracted from the free-text count message.",
  input_schema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "The date this count is for, in YYYY-MM-DD format.",
      },
      motivo: {
        type: ["string", "null"],
        description:
          'Optional free-text reason for a recount divergence (e.g. text after "Motivo:"). null if absent.',
      },
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            location: {
              type: "string",
              enum: ["mezanino", "cozinha"],
              description: "Which stock location this block is for.",
            },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  supplyRaw: {
                    type: "string",
                    description: "Supply token exactly as in the text (e.g. G, PCT CHICKEN, CHICKEN SESSÃO)",
                  },
                  quantity: {
                    type: "number",
                    description: "Reported quantity for this line (no conversion)",
                  },
                  unitKind: {
                    type: "string",
                    enum: ["unit", "package"],
                    description: 'package if PCT/CX present on the line; unit otherwise',
                  },
                  actualQuantity: {
                    type: ["number", "null"],
                    description:
                      "Rare D5 override: actual aggregate quantity if explicitly mentioned for this supply. null otherwise.",
                  },
                },
                required: ["supplyRaw", "quantity", "unitKind"],
              },
            },
          },
          required: ["location", "lines"],
        },
      },
    },
    required: ["date", "locations"],
  },
} as const;

export async function requestStructuredParse(client: Anthropic, rawText: string): Promise<unknown> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(todayIso),
    tools: [PARSE_TOOL],
    tool_choice: { type: "tool", name: PARSE_TOOL.name },
    messages: [{ role: "user", content: rawText }],
  });

  const toolUseBlock = response.content.find((block) => block.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("The model did not return a tool call with the structured parse.");
  }
  return toolUseBlock.input;
}

export function createClaudeParser(apiKey: string): LLMParser {
  const client = createClaudeClient(apiKey);
  return {
    async parse(rawText: string) {
      const data = await requestStructuredParse(client, rawText);
      return { data, provider: "claude" };
    },
  };
}

/**
 * C5/D10: the fallback to Gemini triggers on timeout, 5xx, or rate limiting (429) —
 * anything else (bad request, auth failure, content parse issue) is a real error that
 * retrying with a different model wouldn't fix, so it's surfaced as-is.
 */
export function isRetryableClaudeError(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return true;
  }
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    return error.status === 429 || error.status >= 500;
  }
  return false;
}
