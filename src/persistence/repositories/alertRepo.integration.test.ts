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
  it("creates an alert unacknowledged and unescalated by default", async () => {
    const testStore = await createTestStore(db);
    const testCount = await createTestCount(testStore.id);

    const created = await alertRepo.insert(db, testCount.id);

    expect(created.acknowledged).toBe(false);
    expect(created.escalated).toBe(false);
  });

  it("marks an alert as acknowledged with who and when", async () => {
    const testStore = await createTestStore(db);
    const testCount = await createTestCount(testStore.id);
    const created = await alertRepo.insert(db, testCount.id);

    await alertRepo.markAcknowledged(db, created.id, "9999");

    const found = await alertRepo.findById(db, created.id);
    expect(found?.acknowledged).toBe(true);
    expect(found?.acknowledgedBy).toBe("9999");
    expect(found?.acknowledgedAt).not.toBeNull();
  });

  it("marks an alert as escalated with the escalation target", async () => {
    const testStore = await createTestStore(db);
    const testCount = await createTestCount(testStore.id);
    const created = await alertRepo.insert(db, testCount.id);

    await alertRepo.markEscalated(db, created.id, "responsible-id");

    const found = await alertRepo.findById(db, created.id);
    expect(found?.escalated).toBe(true);
    expect(found?.escalatedTo).toBe("responsible-id");
  });

  it("lists only alerts that are neither acknowledged nor escalated", async () => {
    const testStore = await createTestStore(db);

    const pending = await alertRepo.insert(db, (await createTestCount(testStore.id)).id);
    const acknowledged = await alertRepo.insert(db, (await createTestCount(testStore.id)).id);
    const escalated = await alertRepo.insert(db, (await createTestCount(testStore.id)).id);

    await alertRepo.markAcknowledged(db, acknowledged.id, "9999");
    await alertRepo.markEscalated(db, escalated.id, "responsible-id");

    const pendingList = await alertRepo.listPendingEscalation(db);

    expect(pendingList.map((a) => a.id)).toEqual([pending.id]);
  });
});
