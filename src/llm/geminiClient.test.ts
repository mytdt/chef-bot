import { describe, expect, it, vi } from "vitest";
import { createGeminiParser, type GeminiModelsApi } from "src/llm/geminiClient.js";

describe("createGeminiParser", () => {
  it("returns the function call args as the parsed data, tagged with provider 'gemini'", async () => {
    const models: GeminiModelsApi = {
      generateContent: vi.fn().mockResolvedValue({
        functionCalls: [{ name: "record_count_items", args: { items: [{ supply: "G", quantity: 742 }] } }],
      }),
    };

    const parser = createGeminiParser(models);
    const result = await parser.parse("742 G");

    expect(result).toEqual({ data: { items: [{ supply: "G", quantity: 742 }] }, provider: "gemini" });
  });

  it("forces the tool call via functionCallingConfig mode ANY", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      functionCalls: [{ name: "record_count_items", args: { items: [] } }],
    });
    const models: GeminiModelsApi = { generateContent };

    await createGeminiParser(models).parse("742 G");

    const callArgs = generateContent.mock.calls[0]?.[0];
    expect(callArgs.config.toolConfig.functionCallingConfig.mode).toBe("ANY");
    expect(callArgs.config.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["record_count_items"]);
  });

  it("throws when Gemini returns no function call", async () => {
    const models: GeminiModelsApi = {
      generateContent: vi.fn().mockResolvedValue({ functionCalls: undefined }),
    };

    await expect(createGeminiParser(models).parse("garbled text")).rejects.toThrow(
      "Gemini did not return a function call",
    );
  });
});
