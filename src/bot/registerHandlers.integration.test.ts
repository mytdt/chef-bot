import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "src/bot/telegram.js";
import { registerHandlers } from "src/bot/registerHandlers.js";
import { registerCountHandler } from "src/bot/handlers/count.js";
import { registerIngestXmlCommand } from "src/bot/handlers/ingestXml.js";
import type { LLMParser } from "src/llm/llmParser.js";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileContentApi, DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import {
  createTestStore,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";

const db = getTestDb();
const ADMIN_ID = 111222333;
const ROOT = "root-folder-id";

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function emptyDrive(): DriveFilesApi & DriveFileContentApi & DriveFileBinaryContentApi {
  return {
    async list() {
      return { data: { files: [] } };
    },
    async get() {
      throw new Error("not used in this test");
    },
    async getBinary() {
      throw new Error("not used in this test");
    },
  };
}

function stubTelegramApi() {
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  vi.spyOn(Telegram.prototype, "callApi").mockImplementation(async (method: string, payload: unknown) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 0, type: "group" } };
  });
  return calls;
}

// Mirrors Telegram's real bot_command entity boundary (letters/digits/underscore only).
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

function fakeLlmParser(): LLMParser {
  return {
    parse: async () => ({ data: { date: "2026-01-01", items: [] }, provider: "claude" }),
  };
}

describe("registerHandlers — command vs catch-all order", () => {
  // 2026-07-23: /ingest_xml was registered AFTER registerCountHandler in index.ts.
  // The count catch-all matches every text message (including commands) and used to
  // return without next(), so Telegraf never reached /ingest_xml — silent no-reply
  // in production, while /ping and /llm_check (registered before the catch-all) worked.
  // This exercises the real production composition via registerHandlers + handleUpdate.
  it("replies to /ingest_xml even with the free-text catch-all also registered", async () => {
    await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();

    registerHandlers(bot, {
      db,
      llmParser: fakeLlmParser(),
      adminTelegramIds: [String(ADMIN_ID)],
      ingestXml: {
        adminTelegramIds: [String(ADMIN_ID)],
        driveFiles: emptyDrive(),
        rootFolderId: ROOT,
      },
    });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, ADMIN_ID));

    const replies = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text);
    expect(replies.some((text) => typeof text === "string" && text.includes("Vendas"))).toBe(true);
  });

  // Locks in the Telegraf failure mode itself: a text catch-all registered *before* a
  // command, that returns without next() on "/...", swallows the command. If someone
  // reintroduces that early-return (and somehow bypasses registerHandlers' order),
  // this still documents the interaction that broke production.
  it("documents that a catch-all registered before a command, returning without next(), swallows it", async () => {
    await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();

    // Intentionally wrong order + a catch-all that does NOT call next() on commands.
    bot.on("text", async (ctx) => {
      if (ctx.message && "text" in ctx.message && ctx.message.text.startsWith("/")) {
        return;
      }
    });
    registerIngestXmlCommand(bot, db, {
      adminTelegramIds: [String(ADMIN_ID)],
      driveFiles: emptyDrive(),
      rootFolderId: ROOT,
    });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, ADMIN_ID));

    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });

  it("still reaches /ingest_xml when the count catch-all is registered first but forwards via next()", async () => {
    await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();

    // Wrong order relative to registerHandlers — should still work because count.ts
    // now calls next() for command-looking text (defense in depth).
    registerCountHandler(bot, { llmParser: fakeLlmParser() });
    registerIngestXmlCommand(bot, db, {
      adminTelegramIds: [String(ADMIN_ID)],
      driveFiles: emptyDrive(),
      rootFolderId: ROOT,
    });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, ADMIN_ID));

    const replies = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text);
    expect(replies.some((text) => typeof text === "string" && text.includes("Vendas"))).toBe(true);
  });
});
