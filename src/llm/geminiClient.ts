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
const SYSTEM_PROMPT = `You interpret free-text stock count messages from an employee at a burger restaurant
(Burgers category), sent via Telegram. The format varies, but it's usually a list of
"quantity + supply code" separated by slashes or commas, e.g.: "742 G / 689 F / 380 W / 9 PCT CHICKEN".

Extract each item from the message, preserving the supply code/name exactly as it appears in the text
(do not translate or normalize it). If the employee explicitly mentions the actual quantity of a
variable-quantity package (e.g., "opened the chicken package and it had 8.5"), fill in actualQuantity
for that item; otherwise leave it out. Do not invent items that aren't in the text.`;

const PARSE_FUNCTION_NAME = "record_count_items";

const PARSE_FUNCTION_DECLARATION: FunctionDeclaration = {
  name: PARSE_FUNCTION_NAME,
  description: "Records the structured items extracted from the free-text count message.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            supply: {
              type: Type.STRING,
              description: "Supply code or name exactly as it appears in the text (e.g., G, F, W, PCT CHICKEN)",
            },
            quantity: {
              type: Type.NUMBER,
              description: "Reported quantity for this supply",
            },
            actualQuantity: {
              type: Type.NUMBER,
              description:
                "Actual quantity reported by the employee when opening a variable-quantity package, if explicitly mentioned. Omit otherwise.",
            },
          },
          required: ["supply", "quantity"],
        },
      },
    },
    required: ["items"],
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
      const response = await models.generateContent({
        model: MODEL,
        contents: rawText,
        config: {
          systemInstruction: SYSTEM_PROMPT,
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
