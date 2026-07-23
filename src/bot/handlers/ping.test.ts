import { describe, expect, it, vi } from "vitest";
import type { Context, MiddlewareFn, Telegraf } from "telegraf";
import { registerPingCommand } from "src/bot/handlers/ping.js";

function fakeBot() {
  const commands = new Map<string, MiddlewareFn<Context>[]>();
  const bot = {
    command: (name: string, ...handlers: MiddlewareFn<Context>[]) => {
      commands.set(name, handlers);
    },
  } as unknown as Telegraf<Context>;
  return { bot, commands };
}

function fakeCtx() {
  return { reply: vi.fn() } as unknown as Context & { reply: ReturnType<typeof vi.fn> };
}

describe("registerPingCommand", () => {
  it("registers /ping with no extra middleware — group auth is applied bot-wide (telegram.ts), not per-command", async () => {
    const { bot, commands } = fakeBot();
    registerPingCommand(bot);

    const handlers = commands.get("ping");
    expect(handlers).toHaveLength(1);
  });

  it("replies immediately with a pong message", async () => {
    const { bot, commands } = fakeBot();
    registerPingCommand(bot);
    const ctx = fakeCtx();

    await commands.get("ping")?.[0]?.(ctx, vi.fn());

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Pong"));
  });
});
