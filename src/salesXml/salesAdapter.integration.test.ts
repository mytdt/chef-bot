import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processNfceSale } from "src/salesXml/salesAdapter.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

// Synthetic fixture matching the real NFC-e shape — not real customer data (fiscal
// XMLs are sensitive and never committed).
function nfceXml(opts: { natOp?: string; items: { cProd: string | number; qCom: string | number }[] }): string {
  const natOp = opts.natOp ?? "venda";
  const detBlocks = opts.items
    .map(
      (item, index) => `
    <det nItem="${index + 1}">
      <prod>
        <cProd>${item.cProd}</cProd>
        <qCom>${item.qCom}</qCom>
      </prod>
    </det>`,
    )
    .join("");

  return `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe0000000000">
      <ide>
        <natOp>${natOp}</natOp>
        <dhEmi>2026-07-18T18:16:38-03:00</dhEmi>
      </ide>
      ${detBlocks}
    </infNFe>
  </NFe>
</nfeProc>`;
}

describe("processNfceSale", () => {
  it("writes an InventoryMovement (source: xml_drive) for each mapped line item", async () => {
    const testStore = await createTestStore(db);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger de 90g" });
    const supplyG = await createTestSupply(db, testStore.id, { code: "G", name: "Burger de 160g" });

    const xml = nfceXml({
      items: [
        { cProd: 1001, qCom: "1.0000" }, // F x1
        { cProd: 1027, qCom: "2.0000" }, // G x1 -> quantity 2
      ],
    });

    const result = await processNfceSale(db, testStore.id, xml);

    expect(result.skippedNonSale).toBe(false);
    expect(result.inserted).toEqual([
      { supplyCode: "F", quantity: 1 },
      { supplyCode: "G", quantity: 2 },
    ]);

    const totalsF = await inventoryMovementRepo.sumSince(db, supplyF.id, new Date(0));
    const totalsG = await inventoryMovementRepo.sumSince(db, supplyG.id, new Date(0));
    expect(totalsF.sales).toBe(1);
    expect(totalsG.sales).toBe(2);
  });

  it("applies the ×2 multiplier for double-protein product codes", async () => {
    const testStore = await createTestStore(db);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger de 90g" });

    const xml = nfceXml({ items: [{ cProd: 1005, qCom: "1.0000" }] }); // F x2 per unit sold

    const result = await processNfceSale(db, testStore.id, xml);

    expect(result.inserted).toEqual([{ supplyCode: "F", quantity: 2 }]);
    const totals = await inventoryMovementRepo.sumSince(db, supplyF.id, new Date(0));
    expect(totals.sales).toBe(2);
  });

  it("skips (not throws) product codes with no PRODUCT_MAP entry", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "F", name: "Burger de 90g" });

    const xml = nfceXml({ items: [{ cProd: 1001, qCom: "1.0000" }, { cProd: "999999999", qCom: "1.0000" }] });

    const result = await processNfceSale(db, testStore.id, xml);

    expect(result.inserted).toHaveLength(1);
    expect(result.skippedUnmappedProductCodes).toEqual(["999999999"]);
  });

  it("skips (not throws) a mapped product whose Supply doesn't exist for this store", async () => {
    const testStore = await createTestStore(db);
    // No "F" supply created for this store.

    const xml = nfceXml({ items: [{ cProd: 1001, qCom: "1.0000" }] });

    const result = await processNfceSale(db, testStore.id, xml);

    expect(result.inserted).toHaveLength(0);
    expect(result.skippedSupplyCodesNotFound).toEqual(["F"]);
  });

  it("skips (not throws) a fractional quantity for a Burger-category Supply", async () => {
    const testStore = await createTestStore(db);
    const supplyF = await createTestSupply(db, testStore.id, { code: "F", name: "Burger de 90g" }); // category: "burger" (default)

    const xml = nfceXml({ items: [{ cProd: 1001, qCom: "1.5000" }] }); // F x1 -> quantity 1.5, not a whole number

    const result = await processNfceSale(db, testStore.id, xml);

    expect(result.inserted).toEqual([]);
    expect(result.skippedInvalidQuantity).toEqual([{ supplyCode: "F", quantity: 1.5 }]);
    const totals = await inventoryMovementRepo.sumSince(db, supplyF.id, new Date(0));
    expect(totals.sales).toBe(0);
  });

  it("skips the whole document (no writes) when natOp is not venda", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "F", name: "Burger de 90g" });

    const xml = nfceXml({ natOp: "devolucao", items: [{ cProd: 1001, qCom: "1.0000" }] });

    const result = await processNfceSale(db, testStore.id, xml);

    expect(result.skippedNonSale).toBe(true);
    expect(result.inserted).toHaveLength(0);
  });
});
