import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { Telegram } from "telegraf";
import { createBot } from "src/bot/telegram.js";
import { startEscalation } from "src/alerts/escalation.js";
import * as alertRepo from "src/persistence/repositories/alertRepo.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

afterEach(() => {
  // Telegram.prototype.callApi is a shared prototype-level spy — see botFlow.integration.test.ts.
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

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

describe("startEscalation (D12: posts to the group, not a DM)", () => {
  it("sends the escalation message to the store's group id, not a separate contact", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "-1009999999999" });
    const testRoutine = await createTestRoutine(db, testStore.id);
    const testSupply = await createTestSupply(db, testStore.id);
    const testCount = await countRepo.insert(db, {
      routineId: testRoutine.id,
      supplyId: testSupply.id,
      collaboratorTelegramId: "12345",
      rawText: "380 W",
      reportedValue: 380,
      actualQuantityReported: null,
      expectedValue: 400,
      matched: false,
      confirmedByCollaborator: true,
    });
    const alertCreated = await alertRepo.insert(db, testCount.id);
    // Force it overdue by rewriting sentAt directly — no repo setter for this, raw SQL is fine for a test fixture.
    await db.execute(sql`UPDATE alert SET sent_at = now() - interval '20 minutes' WHERE id = ${alertCreated.id}`);

    const bot = createBot("fake-token", testStore.telegramGroupId);
    const calls = stubTelegramApi();

    const timer = startEscalation(bot, db, { timeoutMinutes: 15, groupId: testStore.telegramGroupId });
    await flushMicrotasks();
    clearInterval(timer);

    const sendMessageCalls = calls.filter((c) => c.method === "sendMessage");
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0]?.payload.chat_id).toBe(testStore.telegramGroupId);

    const escalated = await alertRepo.findById(db, alertCreated.id);
    expect(escalated?.escalated).toBe(true);
    expect(escalated?.escalatedTo).toBe(testStore.telegramGroupId);
  });

  it("does not escalate an alert that isn't overdue yet", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "-1009999999999" });
    const testRoutine = await createTestRoutine(db, testStore.id);
    const testSupply = await createTestSupply(db, testStore.id);
    const testCount = await countRepo.insert(db, {
      routineId: testRoutine.id,
      supplyId: testSupply.id,
      collaboratorTelegramId: "12345",
      rawText: "380 W",
      reportedValue: 380,
      actualQuantityReported: null,
      expectedValue: 400,
      matched: false,
      confirmedByCollaborator: true,
    });
    await alertRepo.insert(db, testCount.id); // sentAt defaults to now() — not overdue

    const bot = createBot("fake-token", testStore.telegramGroupId);
    const calls = stubTelegramApi();

    const timer = startEscalation(bot, db, { timeoutMinutes: 15, groupId: testStore.telegramGroupId });
    await flushMicrotasks();
    clearInterval(timer);

    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });
});
