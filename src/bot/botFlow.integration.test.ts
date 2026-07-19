import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Anthropic } from "@anthropic-ai/sdk";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "src/bot/telegram.js";
import { registerCountHandler } from "src/bot/handlers/count.js";
import { registerConfirmationHandler } from "src/bot/handlers/confirmation.js";
import { registerAlertHandler } from "src/bot/handlers/alert.js";
import * as alertRepo from "src/persistence/repositories/alertRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";

const db = getTestDb();
const COLLABORATOR_ID = 111222333;
const COUNT_ROUTINE_NAME = "Contagem de Carne";

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

afterEach(() => {
  // Telegram.prototype.callApi is a shared prototype-level spy (see stubTelegramApi) —
  // must be restored after each test so it doesn't leak into unrelated test files.
  vi.restoreAllMocks();
});

// Fake Anthropic client: parseCountText only ever calls .messages.create() and reads a
// tool_use block from the response, so a minimal stub is enough to exercise the real
// bot/parse.ts + Zod validation without hitting the real API. `as unknown as Anthropic`
// is justified — building a fully-typed SDK client for a test double isn't practical.
function fakeClaudeClient(items: { supply: string; quantity: number; actualQuantity?: number | null }[]): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "tool_use", input: { items } }],
      }),
    },
  } as unknown as Anthropic;
}

// Records every outbound Telegram API call instead of hitting the network, and returns
// just enough of a response shape for Telegraf to keep going. Telegraf builds a *new*
// Telegram instance per handleUpdate() call (see telegraf.js handleUpdate), so the spy
// must live on the shared prototype, not on a single bot.telegram instance.
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
    const testStore = await createTestStore(db);
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    const testSupply = await createTestSupply(db, testStore.id, { name: "TestBurger" });
    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "receipt", quantity: 100 });

    const bot = createBot("fake-token", [String(COLLABORATOR_ID)]);
    const calls = stubTelegramApi();
    registerCountHandler(bot, { claudeClient: fakeClaudeClient([{ supply: "TestBurger", quantity: 100 }]) });
    registerConfirmationHandler(bot, db);
    registerAlertHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("100 TestBurger", 555));
    const confirmData = callbackDataFromLastReply(calls);
    expect(confirmData).toMatch(/^confirm:/);

    await bot.handleUpdate(callbackQueryUpdate(confirmData, 555));

    const finalReply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(finalReply?.payload.text).toContain("Tudo certo");
    expect(finalReply?.payload.text).not.toContain("Alerta");
  });

  it("posts an alert to the store group and does not reveal the expected value when the count doesn't match", async () => {
    const testStore = await createTestStore(db);
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    await createTestSupply(db, testStore.id, { name: "TestBurger2" });
    // No movements recorded -> expected value is 0; reporting 50 is a mismatch.

    const bot = createBot("fake-token", [String(COLLABORATOR_ID)]);
    const calls = stubTelegramApi();
    registerCountHandler(bot, { claudeClient: fakeClaudeClient([{ supply: "TestBurger2", quantity: 50 }]) });
    registerConfirmationHandler(bot, db);
    registerAlertHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("50 TestBurger2", 555));
    const confirmData = callbackDataFromLastReply(calls);

    await bot.handleUpdate(callbackQueryUpdate(confirmData, 555));

    const groupAlert = calls.find(
      (c) => c.method === "sendMessage" && typeof c.payload.text === "string" && c.payload.text.includes("@all"),
    );
    expect(groupAlert).toBeDefined();
    expect(groupAlert?.payload.text).not.toMatch(/\b0\b/); // expected value (0) never appears in the alert text

    const confirmationReply = calls.filter((c) => c.method === "sendMessage").at(-1);
    expect(confirmationReply?.payload.text).toContain("Alerta enviado ao grupo");

    const pendingAlerts = await alertRepo.listPendingEscalation(db);
    expect(pendingAlerts).toHaveLength(1);
  });

  it("marks the alert as acknowledged when the 'Reconheço' button is pressed", async () => {
    const testStore = await createTestStore(db);
    await createTestRoutine(db, testStore.id, { name: COUNT_ROUTINE_NAME });
    await createTestSupply(db, testStore.id, { name: "TestBurger3" });

    const bot = createBot("fake-token", [String(COLLABORATOR_ID)]);
    const calls = stubTelegramApi();
    registerCountHandler(bot, { claudeClient: fakeClaudeClient([{ supply: "TestBurger3", quantity: 999 }]) });
    registerConfirmationHandler(bot, db);
    registerAlertHandler(bot, db);

    await bot.handleUpdate(textMessageUpdate("999 TestBurger3", 555));
    await bot.handleUpdate(callbackQueryUpdate(callbackDataFromLastReply(calls), 555));

    const groupAlertCall = calls.find(
      (c) => c.method === "sendMessage" && typeof c.payload.text === "string" && c.payload.text.includes("@all"),
    );
    const markup = groupAlertCall?.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] };
    const acknowledgeData = markup.inline_keyboard[0]?.[0]?.callback_data;
    expect(acknowledgeData).toMatch(/^acknowledge:/);

    await bot.handleUpdate(callbackQueryUpdate(acknowledgeData as string, 555));

    const pendingAlerts = await alertRepo.listPendingEscalation(db);
    expect(pendingAlerts).toHaveLength(0);
  });
});
