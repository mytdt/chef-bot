import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processWasteIncompleteReport } from "src/wasteXlsx/wasteIncompleteAdapter.js";
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

describe("processWasteIncompleteReport", () => {
  it("records a waste movement for a mapped, existing Supply (SKU 508 -> QUEIJO_GOUDA)", async () => {
    const testStore = await createTestStore(db);
    // category: "cheese" (not the createTestSupply default "burger") — Queijo Gouda is
    // realistically fractional-quantity (kg), and quantityRules.ts only requires whole
    // numbers for "burger". Using the default here would make this test's own fixture
    // trip the isValidQuantity check below, for the wrong reason.
    const testSupply = await createTestSupply(db, testStore.id, { code: "QUEIJO_GOUDA", name: "Queijo Gouda", category: "cheese" });

    const buffer = await buildWasteReportXlsx([
      {
        sku: "508",
        product: "Queijo Gouda",
        date: "01/01/2026",
        period: "Manhã",
        userId: "233",
        reason: "Perda Operacional",
        quantity: 0.02,
        unitCost: 53.41,
        totalValue: 1.12,
      },
    ]);

    const result = await processWasteIncompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([{ supplyCode: "QUEIJO_GOUDA", quantity: 0.02 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBeCloseTo(0.02);
  });

  it("skips an unmapped SKU (e.g. 511, not a tracked insumo) without throwing", async () => {
    const testStore = await createTestStore(db);

    const buffer = await buildWasteReportXlsx([
      {
        sku: "511",
        product: "Coxinha Frango com Catupiry",
        date: "01/01/2026",
        period: "Manhã",
        userId: "233",
        reason: "Perda Operacional",
        quantity: 0.02,
        unitCost: 10.97,
        totalValue: 0.2,
      },
    ]);

    const result = await processWasteIncompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedUnmappedSkus).toEqual(["511"]);
  });

  it("skips a mapped SKU whose Supply hasn't been seeded yet", async () => {
    const testStore = await createTestStore(db);
    // No "QUEIJO_GOUDA" supply created for this store.

    const buffer = await buildWasteReportXlsx([
      {
        sku: "508",
        product: "Queijo Gouda",
        date: "01/01/2026",
        period: "Manhã",
        userId: "233",
        reason: "Perda Operacional",
        quantity: 0.02,
        unitCost: 53.41,
        totalValue: 1.12,
      },
    ]);

    const result = await processWasteIncompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedSupplyCodesNotFound).toEqual(["QUEIJO_GOUDA"]);
  });

  it("skips (not throws) a fractional quantity for a Burger-category Supply", async () => {
    const testStore = await createTestStore(db);
    // Mapped via SKU 508 (the only entry in wasteSkuMap.ts today), but overridden to
    // category: "burger" here specifically to exercise the integer-quantity rule —
    // the report's real row data (0.02) is fractional, which is realistic for Queijo
    // Gouda (cheese) but must be rejected for a Burger-category Supply.
    const testSupply = await createTestSupply(db, testStore.id, { code: "QUEIJO_GOUDA", name: "Test Burger", category: "burger" });

    const buffer = await buildWasteReportXlsx([
      {
        sku: "508",
        product: "Queijo Gouda",
        date: "01/01/2026",
        period: "Manhã",
        userId: "233",
        reason: "Perda Operacional",
        quantity: 0.02,
        unitCost: 53.41,
        totalValue: 1.12,
      },
    ]);

    const result = await processWasteIncompleteReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedInvalidQuantity).toEqual([{ supplyCode: "QUEIJO_GOUDA", quantity: 0.02 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBe(0);
  });

  it("returns hasData: false and inserts nothing for an empty day", async () => {
    const testStore = await createTestStore(db);
    const buffer = await buildEmptyWasteReportXlsx("Lista de Desperdício Incompleto");

    const result = await processWasteIncompleteReport(db, testStore.id, buffer);

    expect(result.hasData).toBe(false);
    expect(result.inserted).toEqual([]);
  });
});
