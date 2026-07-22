import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { createFallbackParser } from "src/llm/fallbackParser.js";
import type { LLMParser } from "src/llm/llmParser.js";

function fakeParser(behavior: (rawText: string) => ReturnType<LLMParser["parse"]>): LLMParser {
  return { parse: vi.fn(behavior) };
}

describe("createFallbackParser (C5/D10)", () => {
  it("returns the primary's result without touching the fallback when the primary succeeds", async () => {
    const fallback = fakeParser(() => {
      throw new Error("fallback should not be called");
    });
    const primary = fakeParser(async () => ({ data: { items: [] }, provider: "claude" }));

    const parser = createFallbackParser(primary, fallback);
    const result = await parser.parse("742 G");

    expect(result.provider).toBe("claude");
    expect(fallback.parse).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when Claude times out", async () => {
    const primary = fakeParser(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    const fallback = fakeParser(async () => ({ data: { items: [] }, provider: "gemini" }));

    const parser = createFallbackParser(primary, fallback);
    const result = await parser.parse("742 G");

    expect(result.provider).toBe("gemini");
  });

  it.each([429, 500, 503])("falls back to Gemini when Claude returns a %i", async (status) => {
    const primary = fakeParser(async () => {
      throw Anthropic.APIError.generate(status, {}, "boom", undefined);
    });
    const fallback = fakeParser(async () => ({ data: { items: [] }, provider: "gemini" }));

    const parser = createFallbackParser(primary, fallback);
    const result = await parser.parse("742 G");

    expect(result.provider).toBe("gemini");
  });

  it("does not fall back on a non-retryable error (e.g. bad request)", async () => {
    const primary = fakeParser(async () => {
      throw Anthropic.APIError.generate(400, {}, "bad request", undefined);
    });
    const fallback = fakeParser(() => {
      throw new Error("fallback should not be called");
    });

    const parser = createFallbackParser(primary, fallback);

    await expect(parser.parse("742 G")).rejects.toThrow();
    expect(fallback.parse).not.toHaveBeenCalled();
  });

  it("does not retry again if Gemini itself fails", async () => {
    const primary = fakeParser(async () => {
      throw Anthropic.APIError.generate(500, {}, "boom", undefined);
    });
    const fallback = fakeParser(async () => {
      throw new Error("Gemini also down");
    });

    const parser = createFallbackParser(primary, fallback);

    await expect(parser.parse("742 G")).rejects.toThrow("Gemini also down");
  });
});
