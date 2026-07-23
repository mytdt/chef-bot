import { afterEach, describe, expect, it, vi } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "src/bot/telegram.js";
import { registerPingCommand } from "src/bot/handlers/ping.js";

const GROUP_ID = "555";

afterEach(() => {
  // Telegram.prototype.callApi is a shared prototype-level spy (see botFlow.integration.test.ts) —
  // must be restored after each test so it doesn't leak into unrelated test files.
  vi.restoreAllMocks();
});

function stubTelegramApi() {
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  vi.spyOn(Telegram.prototype, "callApi").mockImplementation(async (method: string, payload: unknown) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 0, type: "group" } };
  });
  return calls;
}

// 2026-07-23: mirrors Telegram's real bot_command entity boundary (only Latin
// letters/digits/underscore are part of a command name —
// https://core.telegram.org/bots/features#commands, a hyphen is not). Computing this
// from the whole first token (as an earlier version of this kind of test helper did
// elsewhere) is what let /ingest-xml and /llm-check ship broken despite 100% passing
// tests — the fake was more permissive than the real platform.
function commandEntityLength(commandText: string): number {
  const match = commandText.match(/^\/[A-Za-z0-9_]*/);
  return match ? match[0].length : 1;
}

function commandUpdate(commandText: string, chatId: number, fromId: number): Update {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "group", title: "Test Group" },
      from: { id: fromId, is_bot: false, first_name: "Tester" },
      text: commandText,
      entities: [{ type: "bot_command", offset: 0, length: commandEntityLength(commandText) }],
    },
  } as unknown as Update;
}

describe("registerPingCommand", () => {
  it("replies to /ping through Telegraf's real command matching (not a hand-rolled fake)", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    registerPingCommand(bot);

    await bot.handleUpdate(commandUpdate("/ping", 555, 111));

    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("Pong");
  });

  it("does not reply to a message from outside the authorized group (D9, applied bot-wide)", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    registerPingCommand(bot);

    await bot.handleUpdate(commandUpdate("/ping", 999, 111));

    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });
});
