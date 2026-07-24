import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as routineCheckRepo from "src/persistence/repositories/routineCheckRepo.js";
import { acceptMismatchByRoutineCheckId } from "src/domain/acceptMismatch.js";
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

async function insertCount(
  storeId: string,
  routineId: string,
  supplyId: string,
  values: {
    rawText: string;
    reportedValue: number;
    expectedValue: number;
    matched: boolean;
  },
) {
  return countRepo.insert(db, {
    storeId,
    routineId,
    supplyId,
    collaboratorTelegramId: "1",
    confirmedByTelegramId: "1",
    rawText: values.rawText,
    reportedValue: values.reportedValue,
    actualQuantityReported: null,
    locationBreakdown: null,
    expectedValue: values.expectedValue,
    matched: values.matched,
    confirmedByCollaborator: true,
  });
}

describe("findPendingMismatchesByStore — current pending only", () => {
  it("excludes a supply whose latest check already matched (stale F/G/W after recount)", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });
    const supplyG = await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger W" });
    const supplyChicken = await createTestSupply(db, testStore.id, {
      code: "CHICKEN",
      name: "Chicken",
    });

    // Repeated historical mismatches for F/G/W (production symptom).
    for (const supply of [supplyF, supplyG, supplyW]) {
      await insertCount(testStore.id, testRoutine.id, supply.id, {
        rawText: `old ${supply.code}`,
        reportedValue: 90,
        expectedValue: 100,
        matched: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await insertCount(testStore.id, testRoutine.id, supply.id, {
        rawText: `old2 ${supply.code}`,
        reportedValue: 91,
        expectedValue: 100,
        matched: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Later recounts matched for F/G/W — those supplies are no longer pending.
    for (const supply of [supplyF, supplyG, supplyW]) {
      await insertCount(testStore.id, testRoutine.id, supply.id, {
        rawText: `ok ${supply.code}`,
        reportedValue: 100,
        expectedValue: 100,
        matched: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Only Chicken still has a current mismatch.
    await insertCount(testStore.id, testRoutine.id, supplyChicken.id, {
      rawText: "chicken mismatch",
      reportedValue: 10,
      expectedValue: 12,
      matched: false,
    });

    const pending = await routineCheckRepo.findPendingMismatchesByStore(db, testStore.id);
    expect(pending.map((p) => p.supplyCode)).toEqual(["CHICKEN"]);
    expect(pending).toHaveLength(1);
  });

  it("lists a supply only once when multiple never-fixed mismatches exist", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });

    await insertCount(testStore.id, testRoutine.id, supplyF.id, {
      rawText: "99 F first",
      reportedValue: 99,
      expectedValue: 100,
      matched: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const latest = await insertCount(testStore.id, testRoutine.id, supplyF.id, {
      rawText: "99 F again",
      reportedValue: 98,
      expectedValue: 100,
      matched: false,
    });

    const pending = await routineCheckRepo.findPendingMismatchesByStore(db, testStore.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.routineCheckId).toBe(latest.routineCheckId);
    expect(pending[0]?.reportedValue).toBe(98);
  });

  it("excludes a supply whose latest mismatch was accepted", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });

    const mismatch = await insertCount(testStore.id, testRoutine.id, supplyF.id, {
      rawText: "99 F",
      reportedValue: 99,
      expectedValue: 100,
      matched: false,
    });

    const accepted = await acceptMismatchByRoutineCheckId(db, {
      routineCheckId: mismatch.routineCheckId,
      acceptedByTelegramId: "42",
    });
    expect(accepted.ok).toBe(true);

    const pending = await routineCheckRepo.findPendingMismatchesByStore(db, testStore.id);
    expect(pending).toEqual([]);
  });
});
