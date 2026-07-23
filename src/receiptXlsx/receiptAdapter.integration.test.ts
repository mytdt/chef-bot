import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processReceiptReport } from "src/receiptXlsx/receiptAdapter.js";
import { buildReceiptReportXlsx } from "src/receiptXlsx/receiptReportXlsxFixture.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";
import { excelSerialToUtcDate } from "src/wasteXlsx/xlsxCells.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

describe("processReceiptReport", () => {
  it("records a receipt movement from Qtd. Estoque looked up by Supply.sku", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, {
      code: "QUEIJO_CHEDDAR",
      name: "Queijo Cheddar",
      category: "cheese",
      sku: 512,
    });

    const buffer = await buildReceiptReportXlsx([
      {
        sku: 512,
        name: "Queijo Cheddar",
        stockQuantity: 36,
        receivedQuantity: 24,
        receivedAt: 46225,
      },
    ]);

    const result = await processReceiptReport(db, testStore.id, buffer);

    expect(result.hasData).toBe(true);
    expect(result.inserted).toEqual([
      {
        supplyCode: "QUEIJO_CHEDDAR",
        sku: 512,
        quantity: 36,
        recordedAt: excelSerialToUtcDate(46225),
      },
    ]);
    expect(result.skippedUnknownSkus).toEqual([]);

    // recordedAt comes from "Recebido" (Excel serial 46225 = 22/07/2026), not "now".
    const sinceBeforeReceipt = new Date("2026-07-21T00:00:00.000Z");
    const sinceAtReceipt = excelSerialToUtcDate(46225);
    expect(await inventoryMovementRepo.sumSince(db, testSupply.id, sinceBeforeReceipt)).toEqual({
      receipts: 36,
      sales: 0,
      waste: 0,
    });
    expect(await inventoryMovementRepo.sumSince(db, testSupply.id, sinceAtReceipt)).toEqual({
      receipts: 0,
      sales: 0,
      waste: 0,
    });
  });

  it("skips and reports SKUs that are not registered on Supply", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, {
      code: "PAO",
      name: "Pão",
      sku: 201,
    });

    const buffer = await buildReceiptReportXlsx([
      {
        sku: 999,
        name: "Insumo desconhecido",
        stockQuantity: 10,
        receivedAt: 46225,
      },
    ]);

    const result = await processReceiptReport(db, testStore.id, buffer);

    expect(result.inserted).toEqual([]);
    expect(result.skippedUnknownSkus).toEqual([999]);
  });

  it("skips invalid burger quantities (fractional) and still inserts valid rows", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, {
      code: "G",
      name: "Burger de 160g",
      category: "burger",
      sku: 1001,
    });
    const cheese = await createTestSupply(db, testStore.id, {
      code: "QUEIJO",
      name: "Queijo",
      category: "cheese",
      sku: 512,
    });

    const buffer = await buildReceiptReportXlsx([
      {
        sku: 1001,
        name: "Burger",
        stockQuantity: 1.5,
        receivedAt: 46225,
      },
      {
        sku: 512,
        name: "Queijo",
        stockQuantity: 36,
        receivedAt: 46225,
      },
    ]);

    const result = await processReceiptReport(db, testStore.id, buffer);

    expect(result.skippedInvalidQuantity).toEqual([
      { supplyCode: "G", sku: 1001, quantity: 1.5 },
    ]);
    expect(result.inserted).toHaveLength(1);
    expect(result.inserted[0]?.sku).toBe(512);

    const totals = await inventoryMovementRepo.sumSince(db, cheese.id, new Date(0));
    expect(totals.receipts).toBe(36);
  });
});
