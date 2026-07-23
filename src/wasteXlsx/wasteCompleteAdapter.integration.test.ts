import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processWasteCompleteReport } from "src/wasteXlsx/wasteCompleteAdapter.js";
import { buildEmptyWasteReportXlsx, buildWasteReportXlsx } from "src/wasteXlsx/wasteReportXlsxFixture.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

describe("processWasteCompleteReport", () => {
  it("decomposes a wasted menu item into its insumo via productMap.ts (1031 -> Wagyu/W, a real confirmed code)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });

    const buffer = await buildWasteReportXlsx([
      {
        sku: "1031",
        product: "Some Menu Item",
        date: "01/01/2026",
        period: "Noite",
        userId: "999",
        reason: "Some Reason",
        quantity: 1,
        unitCost: 15,
        totalValue: 15,
      },
    ]);

    const result = await processWasteCompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([{ supplyCode: "W", quantity: 1 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBe(1);
  });

  it("skips a menu item code with no PRODUCT_MAP entry", async () => {
    const testStore = await createTestStore(db);

    const buffer = await buildWasteReportXlsx([
      {
        sku: "999999",
        product: "Item Desconhecido",
        date: "18/07/2026",
        period: "Noite",
        userId: "233",
        reason: "Erro",
        quantity: 1,
        unitCost: 5,
        totalValue: 5,
      },
    ]);

    const result = await processWasteCompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedUnmappedProductCodes).toEqual(["999999"]);
  });

  it("skips when the mapped Supply doesn't exist for this store", async () => {
    const testStore = await createTestStore(db);
    // No "G" supply created for this store.

    const buffer = await buildWasteReportXlsx([
      {
        sku: "2028",
        product: "Another Menu Item",
        date: "01/01/2026",
        period: "Noite",
        userId: "999",
        reason: "Some Reason",
        quantity: 1,
        unitCost: 11,
        totalValue: 11,
      },
    ]);

    const result = await processWasteCompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedSupplyCodesNotFound).toEqual(["G"]);
  });

  it("skips (not throws) a fractional quantity for a Burger-category Supply", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" }); // category: "burger" (default)

    const buffer = await buildWasteReportXlsx([
      {
        sku: "1031",
        product: "Some Menu Item",
        date: "01/01/2026",
        period: "Noite",
        userId: "999",
        reason: "Some Reason",
        quantity: 1.5,
        unitCost: 22.5,
        totalValue: 22.5,
      },
    ]);

    const result = await processWasteCompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedInvalidQuantity).toEqual([{ supplyCode: "W", quantity: 1.5 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBe(0);
  });

  it("returns hasData: false and inserts nothing for an empty day", async () => {
    const testStore = await createTestStore(db);
    const buffer = await buildEmptyWasteReportXlsx("Lista de Desperdício Completo");

    const result = await processWasteCompleteReport(db, testStore.id, buffer);

    expect(result.hasData).toBe(false);
    expect(result.inserted).toEqual([]);
  });
});
