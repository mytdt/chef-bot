import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

describe("inventoryMovementRepo", () => {
  it("inserts a movement with the default manual source when omitted", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);

    const created = await inventoryMovementRepo.insert(db, {
      supplyId: testSupply.id,
      type: "receipt",
      quantity: 100,
    });

    expect(created.source).toBe("manual");
    expect(created.quantity).toBe(100);
  });

  it("accepts the xml_drive source (A2)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);

    const created = await inventoryMovementRepo.insert(db, {
      supplyId: testSupply.id,
      type: "sale",
      quantity: 3,
      source: "xml_drive",
    });

    expect(created.source).toBe("xml_drive");
  });

  it("sums receipts, sales and waste separately since a given date", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);
    const since = new Date(Date.now() - 60_000);

    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "receipt", quantity: 500 });
    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "receipt", quantity: 200 });
    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "sale", quantity: 400 });
    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "waste", quantity: 10 });

    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, since);

    expect(totals).toEqual({ receipts: 700, sales: 400, waste: 10 });
  });

  it("ignores movements recorded before the given date", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id);

    await inventoryMovementRepo.insert(db, { supplyId: testSupply.id, type: "receipt", quantity: 999 });

    const sinceTheFuture = new Date(Date.now() + 60_000);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, sinceTheFuture);

    expect(totals).toEqual({ receipts: 0, sales: 0, waste: 0 });
  });

  it("ignores movements from other supplies", async () => {
    const testStore = await createTestStore(db);
    const supplyA = await createTestSupply(db, testStore.id, { name: "Supply A" });
    const supplyB = await createTestSupply(db, testStore.id, { name: "Supply B" });
    const since = new Date(Date.now() - 60_000);

    await inventoryMovementRepo.insert(db, { supplyId: supplyA.id, type: "receipt", quantity: 100 });
    await inventoryMovementRepo.insert(db, { supplyId: supplyB.id, type: "receipt", quantity: 999 });

    const totals = await inventoryMovementRepo.sumSince(db, supplyA.id, since);

    expect(totals.receipts).toBe(100);
  });
});
