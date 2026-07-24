import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as routineCheckRepo from "src/persistence/repositories/routineCheckRepo.js";
import {
  createTestRoutine,
  createTestStore,
  createTestSupply,
  getTestDb,
  resetDatabase,
} from "src/persistence/repositories/testUtils.js";
import type { NewCount } from "src/persistence/repositories/countRepo.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

async function baseCount(
  overrides: Partial<NewCount> & { storeId: string; routineId: string; supplyId: string },
): Promise<NewCount> {
  return {
    collaboratorTelegramId: "12345",
    confirmedByTelegramId: "12345",
    rawText: "742 G",
    reportedValue: 742,
    actualQuantityReported: null,
    locationBreakdown: null,
    expectedValue: 742,
    matched: true,
    confirmedByCollaborator: true,
    ...overrides,
  };
}

describe("countRepo", () => {
  it("preserves rawText exactly as inserted (immutability requirement)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);
    const testRoutine = await createTestRoutine(db, testStore.id);

    const created = await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        rawText: "742 G / 689 F / 380 W",
      }),
    );

    expect(created.rawText).toBe("742 G / 689 F / 380 W");
    expect(created.routineCheckId).toBeTruthy();
  });

  it("finds the most recent confirmed matched count for a supply", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);
    const testRoutine = await createTestRoutine(db, testStore.id);

    await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 100,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const mostRecent = await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 200,
      }),
    );

    const found = await countRepo.findLastConfirmedBySupply(db, testSupply.id);

    expect(found?.id).toBe(mostRecent.id);
    expect(found?.reportedValue).toBe(200);
  });

  it("ignores unconfirmed counts when finding the last confirmed one", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);
    const testRoutine = await createTestRoutine(db, testStore.id);

    const confirmed = await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 100,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 999,
        confirmedByCollaborator: false,
        matched: true,
      }),
    );

    const found = await countRepo.findLastConfirmedBySupply(db, testSupply.id);

    expect(found?.id).toBe(confirmed.id);
  });

  it("ignores confirmed-but-mismatched counts so a failed recount cannot become the baseline (PR #27)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "W", name: "Burger W" });
    const testRoutine = await createTestRoutine(db, testStore.id);

    const lastMatched = await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 330,
        expectedValue: 330,
        matched: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 300,
        expectedValue: 330,
        matched: false,
        confirmedByCollaborator: true,
      }),
    );

    const found = await countRepo.findLastConfirmedBySupply(db, testSupply.id);

    expect(found?.id).toBe(lastMatched.id);
    expect(found?.reportedValue).toBe(330);
    expect(found?.matched).toBe(true);
  });

  it("uses an accepted mismatch as baseline (matched OR accepted)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });
    const testRoutine = await createTestRoutine(db, testStore.id);

    await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 100,
        expectedValue: 100,
        matched: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const mismatch = await countRepo.insert(
      db,
      await baseCount({
        storeId: testStore.id,
        routineId: testRoutine.id,
        supplyId: testSupply.id,
        reportedValue: 99,
        expectedValue: 100,
        matched: false,
      }),
    );
    await routineCheckRepo.acceptIfPending(db, mismatch.routineCheckId, "999");

    const found = await countRepo.findLastConfirmedBySupply(db, testSupply.id);

    expect(found?.id).toBe(mismatch.id);
    expect(found?.reportedValue).toBe(99);
  });

  it("returns null when there is no previous confirmed count", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);

    const found = await countRepo.findLastConfirmedBySupply(db, testSupply.id);

    expect(found).toBeNull();
  });
});
