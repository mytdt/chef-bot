import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ingestDailyWaste } from "src/salesXml/dailyWasteIngestion.js";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";

const db = getTestDb();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await resetDatabase(db);
});

const ROOT = "root-folder-id";
const date = new Date("2026-07-18T12:00:00-03:00");

interface FakeNode {
  id: string;
  name: string;
  type: "folder" | "file";
}

// Content is stored/returned as plain text via Buffer round-tripping (UTF-8) instead of
// real PDF bytes — paired with a fake `extractText` that just decodes the buffer back
// to a string (see below), so these tests exercise ingestDailyWaste's orchestration
// (classification routing, idempotency, ambiguity, per-file error isolation) without
// needing to construct real PDF binary content, which pdf-parse itself already has
// dedicated coverage for (wasteIncompleteParser.test.ts/wasteCompleteParser.test.ts).
function fakeDrive(tree: Record<string, FakeNode[]>, contents: Record<string, string>): DriveFilesApi & DriveFileBinaryContentApi {
  return {
    async list({ q }) {
      const parentId = q.match(/'([^']+)' in parents/)?.[1] ?? "";
      const children = tree[parentId] ?? [];
      let filtered = children;
      if (q.includes(`mimeType = 'application/vnd.google-apps.folder'`)) {
        filtered = filtered.filter((node) => node.type === "folder");
      } else if (q.includes(`mimeType != 'application/vnd.google-apps.folder'`)) {
        filtered = filtered.filter((node) => node.type === "file");
      }
      const nameEquals = q.match(/name = '([^']*)'/)?.[1];
      if (nameEquals !== undefined) filtered = filtered.filter((node) => node.name === nameEquals);
      const nameContains = q.match(/name contains '([^']*)'/)?.[1];
      if (nameContains !== undefined) filtered = filtered.filter((node) => node.name.includes(nameContains));
      return { data: { files: filtered.map((node) => ({ id: node.id, name: node.name })) } };
    },
    async getBinary(fileId) {
      const content = contents[fileId];
      if (content === undefined) throw new Error(`No fake content for file ${fileId}`);
      return Buffer.from(content, "utf-8");
    },
  };
}

const fakeExtractText = async (buffer: Buffer): Promise<string> => buffer.toString("utf-8");

const INCOMPLETE_HEADER = `Página 1 de 2
Lista de Desperdício Incompleto
FILTROS - DETALHADO
VALOR TOTAL
R$ 1,00
QUANTIDADE
0
0032 - Bom Beef Belem
SKU Produto Data Período Usuário Razão Qtd. Custo Unit. Valor Total Atualizado
em
Atualizado
por
`;
const INCOMPLETE_FOOTER = `
-- 1 of 2 --
`;
function incompleteReport(rows: string): string {
  return INCOMPLETE_HEADER + rows + INCOMPLETE_FOOTER;
}
const INCOMPLETE_ROW_QUEIJO = `508
Queijo
Gouda 01/01/2026 Manhã 233
Perda
Operacional 0,02 R$ 53,41 R$ 1,12`;

const COMPLETE_HEADER = `Página 1 de 2
Lista de Desperdício Completo
FILTROS - DETALHADO
VALOR TOTAL
R$ 15,00
QUANTIDADE
1
0032 - Bom Beef Belem
Cód. Produto Data Período Usuário Razão Qtd Custo Custo Total Atualizado
em
Atualizado
por
`;
const COMPLETE_FOOTER = `
-- 1 of 2 --
`;
function completeReport(rows: string): string {
  return COMPLETE_HEADER + rows + COMPLETE_FOOTER;
}
const COMPLETE_ROW_WAGYU = `1031 Some Menu Item 01/01/2026 Noite 999
Some
Reason 1,00 R$ 15,00 R$ 15,00
01/01/2026
20:00:00 999`;

const EMPTY_REPORT = "Página 1 de 2\nLista de Desperdício\nVALOR TOTAL\nR$ 0,00\nQUANTIDADE\n0\nNenhum dado encontrado\n";

const treeWithBothFiles = {
  [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" as const }],
  "year-2026": [{ id: "month-07", name: "07", type: "folder" as const }],
  "month-07": [{ id: "day-18", name: "18", type: "folder" as const }],
  "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" as const }],
  desperdicios: [
    { id: "complete-file", name: "Desperdicio_Completo.pdf", type: "file" as const },
    { id: "incomplete-file", name: "Desperdicio_Incompleto.pdf", type: "file" as const },
  ],
};

describe("ingestDailyWaste", () => {
  it("returns an empty result (not an error) when the day folder doesn't exist yet", async () => {
    const testStore = await createTestStore(db);
    const drive = fakeDrive({ [ROOT]: [] }, {});

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(result.totalFilesFound).toBe(0);
    expect(result.processed).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("classifies and processes both Completo and Incompleto files, routing each to the correct adapter", async () => {
    const testStore = await createTestStore(db);
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });
    const supplyQueijo = await createTestSupply(db, testStore.id, { code: "QUEIJO_GOUDA", name: "Queijo Gouda", category: "cheese" });

    const contents = {
      "complete-file": completeReport(COMPLETE_ROW_WAGYU),
      "incomplete-file": incompleteReport(INCOMPLETE_ROW_QUEIJO),
    };
    const drive = fakeDrive(treeWithBothFiles, contents);

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(result.totalFilesFound).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.processed).toHaveLength(2);
    expect(result.processed.find((p) => p.fileId === "complete-file")?.reportType).toBe("complete");
    expect(result.processed.find((p) => p.fileId === "incomplete-file")?.reportType).toBe("incomplete");

    const wagyuTotals = await inventoryMovementRepo.sumSince(db, supplyW.id, new Date(0));
    expect(wagyuTotals.waste).toBe(1);
    const queijoTotals = await inventoryMovementRepo.sumSince(db, supplyQueijo.id, new Date(0));
    expect(queijoTotals.waste).toBeCloseTo(0.02);
  });

  it("does not duplicate InventoryMovement when run twice for the same day (idempotency)", async () => {
    const testStore = await createTestStore(db);
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });

    const contents = { "complete-file": completeReport(COMPLETE_ROW_WAGYU) };
    const tree = {
      ...treeWithBothFiles,
      desperdicios: [{ id: "complete-file", name: "Desperdicio_Completo.pdf", type: "file" as const }],
    };
    const drive = fakeDrive(tree, contents);

    const first = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);
    const second = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(first.processed).toHaveLength(1);
    expect(second.processed).toHaveLength(0);
    expect(second.skippedAlreadyProcessed).toEqual([{ fileId: "complete-file", fileName: "Desperdicio_Completo.pdf" }]);

    const totals = await inventoryMovementRepo.sumSince(db, supplyW.id, new Date(0));
    expect(totals.waste).toBe(1); // not 2 — the second run didn't reprocess the file
  });

  it("treats an empty (no-data) report as processed, not an error", async () => {
    const testStore = await createTestStore(db);
    const tree = {
      ...treeWithBothFiles,
      desperdicios: [{ id: "incomplete-file", name: "Desperdicio_Incompleto.pdf", type: "file" as const }],
    };
    const drive = fakeDrive(tree, { "incomplete-file": EMPTY_REPORT });

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(result.errors).toEqual([]);
    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]?.result.hasData).toBe(false);
  });

  it("reports a file with an unrecognized name as an error, without guessing which parser to use", async () => {
    const testStore = await createTestStore(db);
    const tree = {
      ...treeWithBothFiles,
      desperdicios: [{ id: "mystery-file", name: "relatorio_estranho.pdf", type: "file" as const }],
    };
    const drive = fakeDrive(tree, { "mystery-file": "irrelevant" });

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(result.processed).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.fileId).toBe("mystery-file");
    expect(result.errors[0]?.error).toContain("não reconhecido");
  });

  it("treats more than one 'Completo' file on the same day as ambiguous (errors, processes none of them)", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });

    const tree = {
      ...treeWithBothFiles,
      desperdicios: [
        { id: "complete-1", name: "Desperdicio_Completo.pdf", type: "file" as const },
        { id: "complete-2", name: "Desperdicio_Completo (1).pdf", type: "file" as const },
      ],
    };
    const contents = {
      "complete-1": completeReport(COMPLETE_ROW_WAGYU),
      "complete-2": completeReport(COMPLETE_ROW_WAGYU),
    };
    const drive = fakeDrive(tree, contents);

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(result.processed).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.error.includes("ambíguo"))).toBe(true);
  });

  it("reports malformed report text as a per-file error without blocking the other file", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });

    const contents = {
      "complete-file": completeReport(COMPLETE_ROW_WAGYU),
      "incomplete-file": "this text matches no known report format at all",
    };
    const drive = fakeDrive(treeWithBothFiles, contents);

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date, fakeExtractText);

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]?.fileId).toBe("complete-file");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.fileId).toBe("incomplete-file");
  });
});
