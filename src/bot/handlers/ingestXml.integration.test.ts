import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "src/bot/telegram.js";
import { registerIngestXmlCommand } from "src/bot/handlers/ingestXml.js";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileContentApi, DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import * as dailyIngestionRunRepo from "src/persistence/repositories/dailyIngestionRunRepo.js";
import * as awaitingIngestionCountRepo from "src/persistence/repositories/awaitingIngestionCountRepo.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";
import { testAggregatedItem } from "src/test/countFixtures.js";

const db = getTestDb();
const ADMIN_ID = 111222333;
const NON_ADMIN_ID = 999888777;
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

// Empty Drive: every folder lookup returns no children, so all three finders bottom out
// at "no files yet" without needing a full fake folder tree for these tests.
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

// 2026-07-23 fix: this used to take the whole first whitespace-delimited token as the
// entity length (`commandText.split(/\s+/)[0].length`) — which is NOT how Telegram's
// real client computes a bot_command entity. Telegram only accepts Latin letters,
// digits, and underscores in a command name
// (https://core.telegram.org/bots/features#commands); the entity stops at the first
// character outside that set. The old version of this helper would happily "match" a
// command like "/ingest-xml" in full (hyphen included), which is exactly why these
// tests kept passing 100% while the real /ingest-xml silently never matched anything
// in production — the fake was more permissive than the real platform.
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

describe("registerIngestXmlCommand", () => {
  it("denies a non-admin and does not run any ingestion", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerIngestXmlCommand(bot, db, { adminTelegramIds: [String(ADMIN_ID)], driveFiles: emptyDrive(), rootFolderId: ROOT });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, NON_ADMIN_ID));

    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("restrito a administradores");
    expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-18")).toBe(false);
  });

  it("runs all three ingestion types for an admin and records each even when no files are found", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerIngestXmlCommand(bot, db, { adminTelegramIds: [String(ADMIN_ID)], driveFiles: emptyDrive(), rootFolderId: ROOT });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, ADMIN_ID));

    const replies = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text);
    const summaryReply = replies.find((text) => typeof text === "string" && text.includes("Vendas"));
    expect(summaryReply).toContain("Vendas — encontrados: 0");
    expect(summaryReply).toContain("Recebimento — encontrados: 0");
    expect(summaryReply).toContain("Desperdício — encontrados: 0");

    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-18", "sale")).toBe(true);
    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-18", "receipt")).toBe(true);
    expect(await dailyIngestionRunRepo.hasRunForDate(db, testStore.id, "2026-07-18", "waste")).toBe(true);
    expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-18")).toBe(true);
  });

  it("rejects a malformed date argument without recording any run", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerIngestXmlCommand(bot, db, { adminTelegramIds: [String(ADMIN_ID)], driveFiles: emptyDrive(), rootFolderId: ROOT });

    await bot.handleUpdate(commandUpdate("/ingest_xml 18-07-2026", 555, ADMIN_ID));

    const reply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(reply?.payload.text).toContain("Formato inválido");
    // A malformed date is rejected before any DB write — checked with a valid,
    // unrelated date rather than re-querying with the malformed string itself
    // (Postgres can't even parse "18-07-2026" as a `date` column value).
    expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-18")).toBe(false);
  });

  it("resumes a parked count for the same date once all three ingestion types finish", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const testRoutine = await createTestRoutine(db, testStore.id, { name: "Test Routine" });
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    await awaitingIngestionCountRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "12345",
      confirmedByTelegramId: "12345",
      chatId: "555",
      rawText: "10 G",
      date: "2026-07-18",
      items: [testAggregatedItem("G", 10)],
      llmUsed: "claude",
    });

    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerIngestXmlCommand(bot, db, { adminTelegramIds: [String(ADMIN_ID)], driveFiles: emptyDrive(), rootFolderId: ROOT });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, ADMIN_ID));

    const replies = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text);
    expect(replies.some((text) => typeof text === "string" && text.includes("processada(s) automaticamente"))).toBe(true);
    expect(await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-18")).toHaveLength(0);
  });

  it("does not resume a parked count when one ingestion type fails (Drive access error)", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const testRoutine = await createTestRoutine(db, testStore.id, { name: "Test Routine" });
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    await awaitingIngestionCountRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "12345",
      confirmedByTelegramId: "12345",
      chatId: "555",
      rawText: "10 G",
      date: "2026-07-18",
      items: [testAggregatedItem("G", 10)],
      llmUsed: "claude",
    });

    // `list` throws on every call — every finder (sale/receipt/waste) fails at the
    // first folder lookup, so none of the three types get recorded.
    const failingDrive: DriveFilesApi & DriveFileContentApi & DriveFileBinaryContentApi = {
      async list() {
        throw new Error("Drive API unavailable");
      },
      async get() {
        throw new Error("not used in this test");
      },
      async getBinary() {
        throw new Error("not used in this test");
      },
    };

    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerIngestXmlCommand(bot, db, { adminTelegramIds: [String(ADMIN_ID)], driveFiles: failingDrive, rootFolderId: ROOT });

    await bot.handleUpdate(commandUpdate("/ingest_xml 2026-07-18", 555, ADMIN_ID));

    const replies = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text);
    expect(replies.some((text) => typeof text === "string" && text.includes("processada(s) automaticamente"))).toBe(false);
    expect(await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-18")).toHaveLength(1);
    expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-18")).toBe(false);
  });

  // 2026-07-23: regression test for the bug itself — a hyphen is not a valid character
  // in a Telegram bot command, so a message like "/ingest-xml" never actually reaches
  // this handler in production (Telegram's client truncates the bot_command entity at
  // the hyphen, well before Telegraf's registered "ingest_xml" trigger even gets a
  // chance to compare). This locks in that platform behavior via the real
  // registerIngestXmlCommand + Telegraf command matching, not just the fixed entity
  // helper above, so it fails loudly if a hyphen ever creeps back into a command name.
  it("does not match a hyphenated command name (Telegram commands only allow letters/digits/underscore)", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerIngestXmlCommand(bot, db, { adminTelegramIds: [String(ADMIN_ID)], driveFiles: emptyDrive(), rootFolderId: ROOT });

    // Same message an admin would have sent against the old, broken "/ingest-xml"
    // command name — with a realistic entity boundary, Telegram would only tag "/ingest"
    // as the bot_command, so this must produce absolutely no reply, not even the
    // unconditional admin-denial message.
    await bot.handleUpdate(commandUpdate("/ingest-xml 2026-07-18", 555, ADMIN_ID));

    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
    expect(await dailyIngestionRunRepo.hasAllTypesRunForDate(db, testStore.id, "2026-07-18")).toBe(false);
  });
});
