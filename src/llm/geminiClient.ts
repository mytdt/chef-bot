import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";
import type { LLMParser } from "src/llm/llmParser.js";

const MODEL = "gemini-2.5-flash";

// Same instructions given to Claude (claudeClient.ts) — kept in sync manually, not
// shared as a constant, so each provider's prompt can be tuned independently if one
// of the two starts misparsing something the other handles fine.
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
on that line; otherwise leave it out. Do not invent items that aren't in the text.

Today's date is ${todayIso} (YYYY-MM-DD). The message may mention which day the count is for (e.g.,
"contagem de ontem", "22/07"); resolve it to YYYY-MM-DD format. If no date is mentioned, use today's
date — most counts are for the current day.

Optional: if the message includes a free-text explanation of a prior divergence (usually a line
starting with "Motivo:" / "motivo:"), put that explanation in the top-level "motivo" field.
If there is no such explanation, omit "motivo". Do not invent a motivo.`;
}

const PARSE_FUNCTION_NAME = "record_count_items";

const PARSE_FUNCTION_DECLARATION: FunctionDeclaration = {
  name: PARSE_FUNCTION_NAME,
  description: "Records the structured locations/lines extracted from the free-text count message.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: {
        type: Type.STRING,
        description: "The date this count is for, in YYYY-MM-DD format.",
      },
      motivo: {
        type: Type.STRING,
        description:
          'Optional free-text reason for a recount divergence (e.g. text after "Motivo:"). Omit if absent.',
      },
      locations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            location: {
              type: Type.STRING,
              description: 'Which stock location this block is for: "mezanino" or "cozinha".',
            },
            lines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  supplyRaw: {
                    type: Type.STRING,
                    description: "Supply token exactly as in the text (e.g. G, PCT CHICKEN, CHICKEN SESSÃO)",
                  },
                  quantity: {
                    type: Type.NUMBER,
                    description: "Reported quantity for this line (no conversion)",
                  },
                  unitKind: {
                    type: Type.STRING,
                    description: 'package if PCT/CX present on the line; unit otherwise',
                  },
                  actualQuantity: {
                    type: Type.NUMBER,
                    description:
                      "Rare D5 override: actual aggregate quantity if explicitly mentioned for this supply. Omit otherwise.",
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
};

// Narrow interface (only the one method actually used) so tests can inject a fake
// instead of standing up a real GoogleGenAI client — same pattern as
// salesXml/googleDriveClient.ts's DriveFilesApi.
export interface GeminiModelsApi {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

export function createGeminiClient(apiKey: string): GeminiModelsApi {
  return new GoogleGenAI({ apiKey }).models;
}

export function createGeminiParser(models: GeminiModelsApi): LLMParser {
  return {
    async parse(rawText: string) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const response = await models.generateContent({
        model: MODEL,
        contents: rawText,
        config: {
          systemInstruction: buildSystemPrompt(todayIso),
          tools: [{ functionDeclarations: [PARSE_FUNCTION_DECLARATION] }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: [PARSE_FUNCTION_NAME],
            },
          },
        },
      });

      const call = response.functionCalls?.[0];
      if (!call) {
        throw new Error("Gemini did not return a function call with the structured parse.");
      }
      return { data: call.args, provider: "gemini" as const };
    },
  };
}
