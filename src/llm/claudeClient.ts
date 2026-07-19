import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

export function createClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `You interpret free-text stock count messages from an employee at a burger restaurant
(Burgers category), sent via Telegram. The format varies, but it's usually a list of
"quantity + supply code" separated by slashes or commas, e.g.: "742 G / 689 F / 380 W / 9 PCT CHICKEN".

Extract each item from the message, preserving the supply code/name exactly as it appears in the text
(do not translate or normalize it). If the employee explicitly mentions the actual quantity of a
variable-quantity package (e.g., "opened the chicken package and it had 8.5"), fill in actualQuantity
for that item; otherwise leave it null. Do not invent items that aren't in the text.`;

const PARSE_TOOL = {
  name: "record_count_items",
  description: "Records the structured items extracted from the free-text count message.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            supply: {
              type: "string",
              description: "Supply code or name exactly as it appears in the text (e.g., G, F, W, PCT CHICKEN)",
            },
            quantity: {
              type: "number",
              description: "Reported quantity for this supply",
            },
            actualQuantity: {
              type: ["number", "null"],
              description:
                "Actual quantity reported by the employee when opening a variable-quantity package, if explicitly mentioned. null otherwise.",
            },
          },
          required: ["supply", "quantity"],
        },
      },
    },
    required: ["items"],
  },
} as const;

export async function requestStructuredParse(client: Anthropic, rawText: string): Promise<unknown> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
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
