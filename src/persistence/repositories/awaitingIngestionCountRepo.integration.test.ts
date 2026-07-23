import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as awaitingIngestionCountRepo from "src/persistence/repositories/awaitingIngestionCountRepo.js";
import { createTestRoutine, createTestStore, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";
import { testAggregatedItem } from "src/test/countFixtures.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

async function newEntry(storeId: string, routineId: string, overrides: { date?: string } = {}) {
  return awaitingIngestionCountRepo.insert(db, {
    storeId,
    routineId,
    collaboratorTelegramId: "12345",
    chatId: "555",
    rawText: "10 G",
    date: overrides.date ?? "2026-07-22",
    items: [testAggregatedItem("G", 10)],
    llmUsed: "claude",
  });
}

describe("awaitingIngestionCountRepo", () => {
  it("inserts and lists an entry by store and date", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);

    const created = await newEntry(testStore.id, testRoutine.id);

    const listed = await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-22");
    expect(listed.map((entry) => entry.id)).toEqual([created.id]);
    expect(listed[0]?.items).toEqual([testAggregatedItem("G", 10)]);
  });

  it("does not list entries for a different date", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    await newEntry(testStore.id, testRoutine.id, { date: "2026-07-21" });

    const listed = await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-22");
    expect(listed).toHaveLength(0);
  });

  it("removes an entry by id", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const created = await newEntry(testStore.id, testRoutine.id);

    await awaitingIngestionCountRepo.deleteById(db, created.id);

    const listed = await awaitingIngestionCountRepo.listByStoreAndDate(db, testStore.id, "2026-07-22");
    expect(listed).toHaveLength(0);
  });
});
