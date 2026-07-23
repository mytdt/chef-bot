import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import type { LLMParser } from "src/llm/llmParser.js";
import { createBot } from "src/bot/telegram.js";
import { registerCountHandler } from "src/bot/handlers/count.js";
import { registerConfirmationHandler } from "src/bot/handlers/confirmation.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import * as dailyIngestionRunRepo from "src/persistence/repositories/dailyIngestionRunRepo.js";
import * as awaitingIngestionCountRepo from "src/persistence/repositories/awaitingIngestionCountRepo.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";
import { testAggregatedItem, testParsedLocations } from "src/test/countFixtures.js";

const db = getTestDb();
const COLLABORATOR_ID = 111222333;
const COUNT_ROUTINE_NAME = "Contagem de Carne";
const TEST_DATE = "2026-07-22";

async function recordAllTypesIngested(storeId: string): Promise<void> {
  await dailyIngestionRunRepo.recordRun(db, storeId, TEST_DATE, "sale");
  await dailyIngestionRunRepo.recordRun(db, storeId, TEST_DATE, "receipt");
  await dailyIngestionRunRepo.recordRun(db, storeId, TEST_DATE, "waste");
}

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeLlmParser(supply: string, totalQuantity: number, date: string = TEST_DATE): LLMParser {
  // Put the whole quantity in mezanino; cozinha 0 — aggregate equals totalQuantity.
  return {
    parse: vi.fn().mockResolvedValue({
      data: testParsedLocations(supply, totalQuantity, 0, date),
      provider: "claude",
    }),
  };
}

function stubTelegramApi() {
  let nextMessageId = 1;
  const calls: { method: string; payload: Record<string, unknown> }[] = [];

  vi.spyOn(Telegram.prototype, "callApi").mockImplementation(async (method: string, payload: unknown) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "sendMessage" || method === "editMessageText") {
      return { message_id: nextMessageId++, date: Math.floor(Date.now() / 1000), chat: { id: 0, type: "group" } };
    }
    return true;
  });

  return calls;
}

function textMessageUpdate(text: string, chatId: number): Update {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "group", title: "Test Group" },
      from: { id: COLLABORATOR_ID, is_bot: false, first_name: "Tester" },
      text,
    },
  } as unknown as Update;
}

function callbackQueryUpdate(data: string, chatId: number): Update {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    callback_query: {
      id: String(Math.floor(Math.random() * 1_000_000)),
      from: { id: COLLABORATOR_ID, is_bot: false, first_name: "Tester" },
      chat_instance: "1",
      data,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "group", title: "Test Group" },
        text: "Entendi:\n...",
      },
    },
  } as unknown as Update;
}

function callbackDataFromLastReply(calls: { method: string; payload: Record<string, unknown> }[]): string {
  const sendMessageCalls = calls.filter((c) => c.method === "sendMessage");
  const last = sendMessageCalls.at(-1);
  const markup = last?.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] } | undefined;
  const data = markup?.inline_keyboard[0]?.[0]?.callback_data;
  if (!data) throw new Error("No callback_data found in the last sendMessage call.");
  return data;
}

describe("bot flow (message -> parse -> confirmation -> comparison -> response/alert)", () => {
  it("replies 'tudo certo' and does not post an alert when the count matches the expected value", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    const testSupply = await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "receipt", quantity: 100 });
    await recordAllTypesIngested(testStore.id);

    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerCountHandler(bot, { llmParser: fakeLlmParser("G", 100) });
    registerConfirmationHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("100 G", 555));
    const confirmData = callbackDataFromLastReply(calls);
    expect(confirmData).toMatch(/^confirm:/);

    const d1Text = String(calls.filter((c) => c.method === "sendMessage").at(-1)?.payload.text ?? "");
    expect(d1Text).toContain("MEZANINO");
    expect(d1Text).toContain("COZINHA");
    expect(d1Text).toContain("TOTAIS (comparação)");

    await bot.handleUpdate(callbackQueryUpdate(confirmData, 555));

    const finalReply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(finalReply?.payload.text).toContain("Tudo certo");
    expect(finalReply?.payload.text).not.toContain("Alerta");
  });

  it("posts an alert to the store group and does not reveal the expected value when the count doesn't match", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });
    await recordAllTypesIngested(testStore.id);

    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerCountHandler(bot, { llmParser: fakeLlmParser("F", 50) });
    registerConfirmationHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("50 F", 555));
    const confirmData = callbackDataFromLastReply(calls);

    await bot.handleUpdate(callbackQueryUpdate(confirmData, 555));

    const groupAlert = calls.find(
      (c) => c.method === "sendMessage" && typeof c.payload.text === "string" && c.payload.text.includes("@all"),
    );
    expect(groupAlert).toBeDefined();
    expect(groupAlert?.payload.text).not.toMatch(/\b0\b/);
    expect(groupAlert?.payload.reply_markup).toBeUndefined();

    const confirmationReply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(confirmationReply?.payload.text).toContain("Alerta enviado ao grupo");
  });

  it("parks the count as awaiting ingestion (does not compare/alert) when none of the date's ingestion types have run yet", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    await createTestSupply(db, testStore.id, { code: "W", name: "Burger W" });

    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerCountHandler(bot, { llmParser: fakeLlmParser("W", 10) });
    registerConfirmationHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("10 W", 555));
    await bot.handleUpdate(callbackQueryUpdate(callbackDataFromLastReply(calls), 555));

    const finalReply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(finalReply?.payload.text).toContain("Ainda não recebi todos os dados");
    expect(finalReply?.payload.text).not.toContain("Tudo certo");
    expect(finalReply?.payload.text).not.toContain("Alerta");

    const waiting = await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, TEST_DATE);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.items).toEqual([testAggregatedItem("W", 10)]);
    expect(waiting[0]?.chatId).toBe("555");
    expect(waiting[0]?.llmUsed).toBe("claude");
  });

  it("parks the count as awaiting ingestion when only some of the date's ingestion types have run (not just sale)", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    await createTestSupply(db, testStore.id, { code: "CHORI", name: "Chori" });
    await dailyIngestionRunRepo.recordRun(db, testStore.id, TEST_DATE, "sale");

    const bot = createBot("fake-token", "555");
    const calls = stubTelegramApi();
    registerCountHandler(bot, { llmParser: fakeLlmParser("CHORI", 10) });
    registerConfirmationHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("10 CHORI", 555));
    await bot.handleUpdate(callbackQueryUpdate(callbackDataFromLastReply(calls), 555));

    const finalReply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(finalReply?.payload.text).toContain("Ainda não recebi todos os dados");

    const waiting = await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, TEST_DATE);
    expect(waiting).toHaveLength(1);
  });
});
