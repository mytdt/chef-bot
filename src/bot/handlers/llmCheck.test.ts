import { afterEach, describe, expect, it, vi } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "src/bot/telegram.js";
import { registerLlmCheckCommand } from "src/bot/handlers/llmCheck.js";
import type { LLMParser } from "src/llm/llmParser.js";

const GROUP_ID = "555";
const ADMIN_ID = 111;
const NON_ADMIN_ID = 999;

afterEach(() => {
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
// https://core.telegram.org/bots/features#commands, a hyphen is not). This is the
// exact mechanism that let /llm-check ship broken — a hand-rolled test double that
// bypasses real Telegraf command matching (as an earlier version of this file's tests
// did, capturing bot.command()'s handler directly by string key) can never catch this
// class of bug, no matter how many cases it covers, because it never exercises the
// entity boundary where the bug actually lives.
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

function fakeLlmParser(): LLMParser & { parse: ReturnType<typeof vi.fn> } {
  return { parse: vi.fn() };
}

describe("registerLlmCheckCommand", () => {
  it("calls the real LLMParser with a fixed check text and reports the answering provider (claude)", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    const llmParser = fakeLlmParser();
    llmParser.parse.mockResolvedValue({ data: { date: "2026-01-01", items: [] }, provider: "claude" });
    registerLlmCheckCommand(bot, { adminTelegramIds: [String(ADMIN_ID)], llmParser });

    await bot.handleUpdate(commandUpdate("/llm_check", 555, ADMIN_ID));

    expect(llmParser.parse).toHaveBeenCalledWith("1 G");
    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("claude");
  });

  it("labels a Gemini answer as a fallback, distinct from a normal Claude answer", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    const llmParser = fakeLlmParser();
    llmParser.parse.mockResolvedValue({ data: { date: "2026-01-01", items: [] }, provider: "gemini" });
    registerLlmCheckCommand(bot, { adminTelegramIds: [String(ADMIN_ID)], llmParser });

    await bot.handleUpdate(commandUpdate("/llm_check", 555, ADMIN_ID));

    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("gemini (fallback)");
  });

  it("replies with a clear error instead of throwing when the parser rejects (both Claude and Gemini down)", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    const llmParser = fakeLlmParser();
    llmParser.parse.mockRejectedValue(new Error("both providers unavailable"));
    registerLlmCheckCommand(bot, { adminTelegramIds: [String(ADMIN_ID)], llmParser });

    await expect(bot.handleUpdate(commandUpdate("/llm_check", 555, ADMIN_ID))).resolves.not.toThrow();

    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("Nenhum modelo respondeu");
  });

  it("denies a non-admin and never calls the (paid) LLM API", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    const llmParser = fakeLlmParser();
    registerLlmCheckCommand(bot, { adminTelegramIds: [String(ADMIN_ID)], llmParser });

    await bot.handleUpdate(commandUpdate("/llm_check", 555, NON_ADMIN_ID));

    expect(llmParser.parse).not.toHaveBeenCalled();
    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("restrito a administradores");
  });

  // 2026-07-23: regression test for the bug itself. Locked in via the real
  // registerLlmCheckCommand + Telegraf command matching (not just the fixed entity
  // helper above), so it fails loudly if a hyphen ever creeps back into a command name.
  it("does not match a hyphenated command name (Telegram commands only allow letters/digits/underscore)", async () => {
    const bot = createBot("fake-token", GROUP_ID);
    const calls = stubTelegramApi();
    const llmParser = fakeLlmParser();
    registerLlmCheckCommand(bot, { adminTelegramIds: [String(ADMIN_ID)], llmParser });

    // Same message an admin would have sent against the old, broken "/llm-check"
    // command name — with a realistic entity boundary, Telegram would only tag "/llm"
    // as the bot_command, so this must produce absolutely no reply, not even the
    // unconditional admin-denial message, and must never touch the (paid) LLM API.
    await bot.handleUpdate(commandUpdate("/llm-check", 555, ADMIN_ID));

    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
    expect(llmParser.parse).not.toHaveBeenCalled();
  });
});
