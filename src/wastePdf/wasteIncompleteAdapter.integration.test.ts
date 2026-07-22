import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processWasteIncompleteReport } from "src/wastePdf/wasteIncompleteAdapter.js";
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
Lista de Desperdício Incompleto
FILTROS - DETALHADO
Data fiscal: 01/01/2026 até 01/01/2026
1 Loja(s) Selecionada(s)
VALOR TOTAL
R$ 42,00
QUANTIDADE
0
Nome Quantidade Total
Bom Beef Belem 0 R$ 42,00
0032 - Bom Beef Belem
SKU Produto Data Período Usuário Razão Qtd. Custo Unit. Valor Total Atualizado
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

describe("processWasteIncompleteReport", () => {
  it("records a waste movement for a mapped, existing Supply (SKU 508 -> QUEIJO_GOUDA)", async () => {
    const testStore = await createTestStore(db);
    const testSupply = await createTestSupply(db, testStore.id, { code: "QUEIJO_GOUDA", name: "Queijo Gouda" });

    const text = reportWithRows(`508
Queijo
Gouda 01/01/2026 Manhã 233
Perda
Operacional 0,02 R$ 53,41 R$ 1,12`);

    const result = await processWasteIncompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([{ supplyCode: "QUEIJO_GOUDA", quantity: 0.02 }]);
    const totals = await inventoryMovementRepo.sumSince(db, testSupply.id, new Date(0));
    expect(totals.waste).toBeCloseTo(0.02);
  });

  it("skips an unmapped SKU (e.g. 511, not a tracked insumo) without throwing", async () => {
    const testStore = await createTestStore(db);

    const text = reportWithRows(`511
Coxinha
Frango com
Catupiry 01/01/2026 Manhã 233
Perda
Operacional 0,02 R$ 10,97 R$ 0,20`);

    const result = await processWasteIncompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([]);
    expect(result.skippedUnmappedSkus).toEqual(["511"]);
  });

  it("skips a mapped SKU whose Supply hasn't been seeded yet", async () => {
    const testStore = await createTestStore(db);
    // No "QUEIJO_GOUDA" supply created for this store.

    const text = reportWithRows(`508
Queijo
Gouda 01/01/2026 Manhã 233
Perda
Operacional 0,02 R$ 53,41 R$ 1,12`);

    const result = await processWasteIncompleteReport(db, testStore.id, text);

    expect(result.inserted).toEqual([]);
    expect(result.skippedSupplyCodesNotFound).toEqual(["QUEIJO_GOUDA"]);
  });

  it("returns hasData: false and inserts nothing for an empty day", async () => {
    const testStore = await createTestStore(db);
    const text = `Página 1 de 2\nLista de Desperdício Incompleto\nFILTROS - DETALHADO\nVALOR TOTAL\nR$ 0,00\nQUANTIDADE\n0\nNenhum dado encontrado\n`;

    const result = await processWasteIncompleteReport(db, testStore.id, text);

    expect(result.hasData).toBe(false);
    expect(result.inserted).toEqual([]);
  });
});
