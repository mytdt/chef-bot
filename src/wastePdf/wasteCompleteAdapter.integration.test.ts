import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processWasteCompleteReport } from "src/wastePdf/wasteCompleteAdapter.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

const REPORT_HEADER = `Página 1 de 2
Lista de Desperdício Completo
FILTROS - DETALHADO
VALOR TOTAL
R$ 30,00
QUANTIDADE
2
0032 - Bom Beef Belem
Cód. Produto Data Período Usuário Razão Qtd Custo Custo Total Atualizado
em
Atualizado
por
`;

const PAGE_FOOTER = `
-- 1 of 2 --
`;

function reportWithRows(rows: string): string {
  return REPORT_HEADER + rows + PAGE_FOOTER;
}

describe("processWasteCompleteReport", () => {
  it("decomposes a wasted menu item into its insumo via productMap.ts (1031 -> Wagyu/W, a real confirmed code)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });

    const text = reportWithRows(`1031 Some Menu Item 01/01/2026 Noite 999
Some
Reason 1,00 R$ 15,00 R$ 15,00
01/01/2026
20:00:00 999`);

    const result = await processWasteCompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([{ supplyCode: "W", quantity: 1 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBe(1);
  });

  it("skips a menu item code with no PRODUCT_MAP entry", async () => {
    const testStore = await createTestStore(db);

    const text = reportWithRows(`999999 Item Desconhecido 18/07/2026 Noite 233
Erro 1,00 R$ 5,00 R$ 5,00
18/07/2026
22:52:38 233`);

    const result = await processWasteCompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([]);
    expect(result.skippedUnmappedProductCodes).toEqual(["999999"]);
  });

  it("skips when the mapped Supply doesn't exist for this store", async () => {
    const testStore = await createTestStore(db);
    // No "G" supply created for this store.

    const text = reportWithRows(`2028
Another
Menu Item 01/01/2026 Noite 999
Some
Reason 1,00 R$ 11,00 R$ 11,00
01/01/2026
20:00:00 999`);

    const result = await processWasteCompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([]);
    expect(result.skippedSupplyCodesNotFound).toEqual(["G"]);
  });

  it("skips (not throws) a fractional quantity for a Burger-category Supply", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" }); // category: "burger" (default)

    const text = reportWithRows(`1031 Some Menu Item 01/01/2026 Noite 999
Some
Reason 1,50 R$ 22,50 R$ 22,50
01/01/2026
20:00:00 999`);

    const result = await processWasteCompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([]);
    expect(result.skippedInvalidQuantity).toEqual([{ supplyCode: "W", quantity: 1.5 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBe(0);
  });

  it("returns hasData: false and inserts nothing for an empty day", async () => {
    const testStore = await createTestStore(db);
    const text = `Página 1 de 2\nLista de Desperdício Completo\nFILTROS - DETALHADO\nVALOR TOTAL\nR$ 0,00\nQUANTIDADE\n0\nNenhum dado encontrado\n`;

    const result = await processWasteCompleteReport(db, testStore.id, text);

    expect(result.hasData).toBe(false);
    expect(result.inserted).toEqual([]);
  });
});
