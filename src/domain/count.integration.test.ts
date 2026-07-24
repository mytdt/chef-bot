import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processCountItem } from "src/domain/count.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
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

describe("processCountItem — mismatched recount must not shift expected baseline", () => {
  it("calculates recount expected against the last matched count, ignoring a prior confirmed mismatch", async () => {
    // Production symptom: W informed 300 (expected 330) → re-sent 330 → bot said expected 300.
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger W" });

    await countRepo.insert(db, {
      routineId: testRoutine.id,
      supplyId: supplyW.id,
      collaboratorTelegramId: "1",
      rawText: "baseline",
      reportedValue: 330,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 330,
      matched: true,
      confirmedByCollaborator: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await countRepo.insert(db, {
      routineId: testRoutine.id,
      supplyId: supplyW.id,
      collaboratorTelegramId: "1",
      rawText: "300 W",
      reportedValue: 300,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 330,
      matched: false,
      confirmedByCollaborator: true,
    });

    const result = await processCountItem(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "1",
      rawText: "330 W",
      llmUsed: "claude",
      item: testAggregatedItem("W", 330),
    });

    expect(result.found).toBe(true);
    expect(result.expectedValue).toBe(330);
    expect(result.matched).toBe(true);
    expect(result.reportedValue).toBe(330);
  });
});
