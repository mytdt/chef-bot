import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, Telegraf } from "telegraf";
import { resumeAwaitingCounts } from "src/domain/ingestionResume.js";
import * as awaitingIngestionCountRepo from "src/persistence/repositories/awaitingIngestionCountRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";
import { testAggregatedItem } from "src/test/countFixtures.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

function fakeBot() {
  const sendMessage = vi.fn();
  const bot = { telegram: { sendMessage } } as unknown as Telegraf<Context>;
  return { bot, sendMessage };
}

describe("resumeAwaitingCounts", () => {
  it("processes a parked count, sends the result to the original chat, and removes the awaiting entry", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const testRoutine = await createTestRoutine(db, testStore.id, { name: "Test Routine" });
    const testSupply = await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "receipt", quantity: 10 });

    await awaitingIngestionCountRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "12345",
      chatId: "555",
      rawText: "10 G",
      date: "2026-07-22",
      items: [testAggregatedItem("G", 10)],
      llmUsed: "claude",
    });

    const { bot, sendMessage } = fakeBot();
    const resumedCount = await resumeAwaitingCounts(bot, db, testStore.id, "2026-07-22");

    expect(resumedCount).toBe(1);
    expect(sendMessage).toHaveBeenCalledWith("555", expect.stringContaining("Tudo certo"));

    const remaining = await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-22");
    expect(remaining).toHaveLength(0);
  });

  it("does nothing and returns 0 when there is nothing parked for that date", async () => {
    const testStore = await createTestStore(db);
    const { bot, sendMessage } = fakeBot();

    const resumedCount = await resumeAwaitingCounts(bot, db, testStore.id, "2026-07-22");

    expect(resumedCount).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not resume an entry parked for a different date", async () => {
    const testStore = await createTestStore(db, { telegramGroupId: "555" });
    const testRoutine = await createTestRoutine(db, testStore.id, { name: "Test Routine" });
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    await awaitingIngestionCountRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "12345",
      chatId: "555",
      rawText: "10 G",
      date: "2026-07-21",
      items: [testAggregatedItem("G", 10)],
      llmUsed: "claude",
    });

    const { bot, sendMessage } = fakeBot();
    const resumedCount = await resumeAwaitingCounts(bot, db, testStore.id, "2026-07-22");

    expect(resumedCount).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-21")).toHaveLength(1);
  });
});
