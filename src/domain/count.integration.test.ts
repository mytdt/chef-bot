import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processCountItem } from "src/domain/count.js";
import { acceptLatestMismatch } from "src/domain/acceptMismatch.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as routineCheckRepo from "src/persistence/repositories/routineCheckRepo.js";
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

describe("baseline + /aceitar invariants (PLAN §7.2)", () => {
  it("1. mismatch not accepted does not become baseline (PR #27 / Wagyu)", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger W" });

    await countRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyW.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
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
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyW.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
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
      confirmedByTelegramId: "2",
      rawText: "330 W",
      llmUsed: "claude",
      item: testAggregatedItem("W", 330),
    });

    expect(result.expectedValue).toBe(330);
    expect(result.matched).toBe(true);
  });

  it("2. accepted mismatch becomes baseline (F −1 case)", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });

    await countRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyF.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
      rawText: "baseline",
      reportedValue: 100,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 100,
      matched: true,
      confirmedByCollaborator: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await countRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyF.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
      rawText: "99 F",
      reportedValue: 99,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 100,
      matched: false,
      confirmedByCollaborator: true,
    });

    const accepted = await acceptLatestMismatch(db, {
      storeId: testStore.id,
      supplyToken: "F",
      acceptedByTelegramId: "42",
    });
    expect(accepted.ok).toBe(true);

    const result = await processCountItem(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "2",
      rawText: "99 F",
      llmUsed: "claude",
      item: testAggregatedItem("F", 99),
    });

    expect(result.expectedValue).toBe(99);
    expect(result.matched).toBe(true);
  });

  it("3. seed-style matched=true remains baseline without accepted", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyG = await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });

    const baseline = await countRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyG.id,
      collaboratorTelegramId: "seed-manual",
      confirmedByTelegramId: null,
      rawText: "baseline",
      reportedValue: 500,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 500,
      matched: true,
      confirmedByCollaborator: true,
    });

    const found = await countRepo.findLastConfirmedBySupply(db, supplyG.id);
    expect(found?.id).toBe(baseline.id);
    expect(found?.reportedValue).toBe(500);
  });

  it("4. accepting the same check twice fails clearly", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });

    const mismatch = await countRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyF.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
      rawText: "99 F",
      reportedValue: 99,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 100,
      matched: false,
      confirmedByCollaborator: true,
    });

    const first = await acceptLatestMismatch(db, {
      storeId: testStore.id,
      supplyToken: "F",
      acceptedByTelegramId: "42",
    });
    expect(first.ok).toBe(true);

    const secondViaDomain = await acceptLatestMismatch(db, {
      storeId: testStore.id,
      supplyToken: "F",
      acceptedByTelegramId: "42",
    });
    expect(secondViaDomain).toEqual({ ok: false, reason: "already_accepted", supplyToken: "F" });

    const secondViaRepo = await routineCheckRepo.acceptIfPending(db, mismatch.routineCheckId, "42");
    expect(secondViaRepo).toBeNull();
  });

  it("5. recount after unaccepted mismatch still uses the prior matched baseline", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger W" });

    await countRepo.insert(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyW.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
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
      storeId: testStore.id,
      routineId: testRoutine.id,
      supplyId: supplyW.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "1",
      rawText: "300 W",
      reportedValue: 300,
      actualQuantityReported: null,
      locationBreakdown: null,
      expectedValue: 330,
      matched: false,
      confirmedByCollaborator: true,
    });

    const recount = await processCountItem(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "1",
      confirmedByTelegramId: "9",
      rawText: "330 W",
      llmUsed: "claude",
      item: testAggregatedItem("W", 330),
    });

    expect(recount.expectedValue).toBe(330);
    expect(recount.matched).toBe(true);
  });

  it("stores confirmed_by_telegram_id on the routine_check envelope", async () => {
    const testStore = await createTestStore(db);
    const testRoutine = await createTestRoutine(db, testStore.id);
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger G" });

    const result = await processCountItem(db, {
      storeId: testStore.id,
      routineId: testRoutine.id,
      collaboratorTelegramId: "sender-1",
      confirmedByTelegramId: "confirmer-9",
      rawText: "0 G",
      llmUsed: "claude",
      item: testAggregatedItem("G", 0),
    });

    const created = await countRepo.findById(db, result.countId!);
    const check = await routineCheckRepo.findById(db, created!.routineCheckId);
    expect(check?.collaboratorTelegramId).toBe("sender-1");
    expect(check?.confirmedByTelegramId).toBe("confirmer-9");
  });

  it("reports nothing_to_accept when there is no pending mismatch", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "F", name: "Burger F" });

    const result = await acceptLatestMismatch(db, {
      storeId: testStore.id,
      supplyToken: "F",
      acceptedByTelegramId: "1",
    });
    expect(result).toEqual({ ok: false, reason: "nothing_to_accept", supplyToken: "F" });
  });
});
