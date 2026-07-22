import { afterAll, beforeEach, describe, expect, it } from "vitest";
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

async function createTestCount(storeId: string) {
  const testSupply = await createTestSupply(db, storeId);
  const testRoutine = await createTestRoutine(db, storeId);
  return countRepo.insert(db, {
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
}

describe("alertRepo", () => {
  it("creates an alert record for a count, as an audit trail (C6: no ack/escalation state)", async () => {
    const testStore = await createTestStore(db);
    const testCount = await createTestCount(testStore.id);

    const created = await alertRepo.insert(db, testCount.id);

    expect(created.countId).toBe(testCount.id);
    expect(created.sentAt).not.toBeNull();
  });

  it("finds an alert by id", async () => {
    const testStore = await createTestStore(db);
    const testCount = await createTestCount(testStore.id);
    const created = await alertRepo.insert(db, testCount.id);

    const found = await alertRepo.findById(db, created.id);

    expect(found?.id).toBe(created.id);
  });
});
