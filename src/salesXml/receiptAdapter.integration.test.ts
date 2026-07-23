import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processNfeReceipt } from "src/salesXml/receiptAdapter.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

function nfe55Xml(opts: { mod?: string; items: { cProd: string; qCom: string }[] }): string {
  const mod = opts.mod ?? "55";
  const detBlocks = opts.items
    .map(
      (item, index) =>
        `<det nItem="${index + 1}"><prod><cProd>${item.cProd}</cProd><xProd>Test product</xProd><qCom>${item.qCom}</qCom><uCom>CX</uCom></prod></det>`,
    )
    .join("");
  return `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe0000000000"><ide><mod>${mod}</mod><natOp>VENDA DE PRODUCAO DO ESTABELECIMENTO</natOp><dhEmi>2026-07-15T14:02:00-03:00</dhEmi></ide>${detBlocks}</infNFe></NFe></nfeProc>`;
}

describe("processNfeReceipt", () => {
  it("converts boxes to units via Supply.unitsPerBox and records a receipt movement", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "G", name: "Burger de 160g", unitsPerBox: 36 });

    const xml = nfe55Xml({ items: [{ cProd: "052700.0160006", qCom: "26.0000" }] });
    const result = await processNfeReceipt(db, testStore.id, xml);

    expect(result.inserted).toEqual([{ supplyCode: "G", quantity: 26 * 36 }]);

    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.receipts).toBe(26 * 36);
  });

  it("skips a product code with no supplier mapping", async () => {
    const testStore = await createTestStore(db);

    const xml = nfe55Xml({ items: [{ cProd: "999999.9999999", qCom: "1.0000" }] });
    const result = await processNfeReceipt(db, testStore.id, xml);

    expect(result.inserted).toEqual([]);
    expect(result.skippedUnmappedProductCodes).toEqual(["999999.9999999"]);
  });

  it("skips when the mapped Supply doesn't exist for this store", async () => {
    const testStore = await createTestStore(db);
    // No "F" supply created for this store.

    const xml = nfe55Xml({ items: [{ cProd: "052700.0090006", qCom: "7.0000" }] });
    const result = await processNfeReceipt(db, testStore.id, xml);

    expect(result.inserted).toEqual([]);
    expect(result.skippedSupplyCodesNotFound).toEqual(["F"]);
  });

  it("skips when the Supply has no unitsPerBox configured (can't convert boxes to units)", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g", unitsPerBox: null });

    const xml = nfe55Xml({ items: [{ cProd: "052100.0200007", qCom: "3.0000" }] });
    const result = await processNfeReceipt(db, testStore.id, xml);

    expect(result.inserted).toEqual([]);
    expect(result.skippedMissingUnitsPerBox).toEqual(["W"]);
  });

  it("skips (not throws) a fractional quantity for a Burger-category Supply", async () => {
    const testStore = await createTestStore(db);
    // unitsPerBox: 3 (not the real 36) so 0.5 boxes -> 1.5 units, a fractional quantity.
    const testSupply = await createTestSupply(db, testStore.id, { code: "G", name: "Burger de 160g", unitsPerBox: 3 });

    const xml = nfe55Xml({ items: [{ cProd: "052700.0160006", qCom: "0.5000" }] });
    const result = await processNfeReceipt(db, testStore.id, xml);

    expect(result.inserted).toEqual([]);
    expect(result.skippedInvalidQuantity).toEqual([{ supplyCode: "G", quantity: 1.5 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.receipts).toBe(0);
  });

  it("skips (does not throw) a document that isn't modelo 55", async () => {
    const testStore = await createTestStore(db);

    const xml = nfe55Xml({ mod: "65", items: [{ cProd: "052700.0160006", qCom: "26.0000" }] });
    const result = await processNfeReceipt(db, testStore.id, xml);

    expect(result.skippedWrongModel).toBe(true);
    expect(result.inserted).toEqual([]);
  });
});
