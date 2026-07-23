import { describe, expect, it, vi } from "vitest";
import type { Context, MiddlewareFn, Telegraf } from "telegraf";
import { registerLlmCheckCommand } from "src/bot/handlers/llmCheck.js";
import type { LLMParser } from "src/llm/llmParser.js";

function fakeBot() {
  const commands = new Map<string, MiddlewareFn<Context>[]>();
  const bot = {
    command: (name: string, ...handlers: MiddlewareFn<Context>[]) => {
      commands.set(name, handlers);
    },
  } as unknown as Telegraf<Context>;
  return { bot, commands };
}

function fakeCtx(userId: number | undefined) {
  return {
    from: userId === undefined ? undefined : { id: userId },
    reply: vi.fn(),
  } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

// Minimal middleware composer — mirrors how Telegraf actually chains the handlers
// passed to bot.command(name, middleware, handler), so the admin gate registered ahead
// of the real handler is exercised the same way it would be at runtime.
async function runCommand(handlers: MiddlewareFn<Context>[], ctx: Context): Promise<void> {
  let index = -1;
  async function dispatch(i: number): Promise<void> {
    if (i <= index) throw new Error("next() called multiple times");
    index = i;
    const fn = handlers[i];
    if (!fn) return;
    await fn(ctx, () => dispatch(i + 1));
  }
  await dispatch(0);
}

function fakeLlmParser(): LLMParser & { parse: ReturnType<typeof vi.fn> } {
  return { parse: vi.fn() };
}

describe("registerLlmCheckCommand", () => {
  it("calls the real LLMParser with a fixed check text and reports the answering provider (claude)", async () => {
    const { bot, commands } = fakeBot();
    const llmParser = fakeLlmParser();
    llmParser.parse.mockResolvedValue({ data: { date: "2026-01-01", items: [] }, provider: "claude" });
    registerLlmCheckCommand(bot, { adminTelegramIds: ["111"], llmParser });

    const ctx = fakeCtx(111);
    await runCommand(commands.get("llm-check") ?? [], ctx);

    expect(llmParser.parse).toHaveBeenCalledWith("1 G");
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("claude"));
  });

  it("labels a Gemini answer as a fallback, distinct from a normal Claude answer", async () => {
    const { bot, commands } = fakeBot();
    const llmParser = fakeLlmParser();
    llmParser.parse.mockResolvedValue({ data: { date: "2026-01-01", items: [] }, provider: "gemini" });
    registerLlmCheckCommand(bot, { adminTelegramIds: ["111"], llmParser });

    const ctx = fakeCtx(111);
    await runCommand(commands.get("llm-check") ?? [], ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("gemini (fallback)"));
  });

  it("replies with a clear error instead of throwing when the parser rejects (both Claude and Gemini down)", async () => {
    const { bot, commands } = fakeBot();
    const llmParser = fakeLlmParser();
    llmParser.parse.mockRejectedValue(new Error("both providers unavailable"));
    registerLlmCheckCommand(bot, { adminTelegramIds: ["111"], llmParser });

    const ctx = fakeCtx(111);

    await expect(runCommand(commands.get("llm-check") ?? [], ctx)).resolves.not.toThrow();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Nenhum modelo respondeu"));
  });

  it("denies a non-admin and never calls the (paid) LLM API", async () => {
    const { bot, commands } = fakeBot();
    const llmParser = fakeLlmParser();
    registerLlmCheckCommand(bot, { adminTelegramIds: ["111"], llmParser });

    const ctx = fakeCtx(999);
    await runCommand(commands.get("llm-check") ?? [], ctx);

    expect(llmParser.parse).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("restrito a administradores"));
  });
});
