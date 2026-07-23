import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ingestDailyWaste } from "src/salesXml/dailyWasteIngestion.js";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { createTestStore, createTestSupply, getTestDb, resetDatabase } from "src/persistence/repositories/testUtils.js";
import {
  buildEmptyWasteReportXlsx,
  buildUnrecognizedWasteReportXlsx,
  buildWasteReportXlsx,
} from "src/wasteXlsx/wasteReportXlsxFixture.js";

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

function fakeDrive(tree: Record<string, FakeNode[]>, contents: Record<string, Buffer>): DriveFilesApi & DriveFileBinaryContentApi {
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
      return content;
    },
  };
}

async function incompleteQueijoBuffer(): Promise<Buffer> {
  return buildWasteReportXlsx([
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
}

async function completeWagyuBuffer(): Promise<Buffer> {
  return buildWasteReportXlsx([
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
}

const treeWithBothFiles = {
  [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" as const }],
  "year-2026": [{ id: "month-07", name: "07", type: "folder" as const }],
  "month-07": [{ id: "day-18", name: "18", type: "folder" as const }],
  "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" as const }],
  desperdicios: [
    { id: "complete-file", name: "Desperdicio_Completo.xlsx", type: "file" as const },
    { id: "incomplete-file", name: "Desperdicio_Incompleto.xlsx", type: "file" as const },
  ],
};

describe("ingestDailyWaste", () => {
  it("returns an empty result (not an error) when the day folder doesn't exist yet", async () => {
    const testStore = await createTestStore(db);
    const drive = fakeDrive({ [ROOT]: [] }, {});

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

    expect(result.totalFilesFound).toBe(0);
    expect(result.processed).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("classifies and processes both Completo and Incompleto files, routing each to the correct adapter", async () => {
    const testStore = await createTestStore(db);
    const supplyW = await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });
    const supplyQueijo = await createTestSupply(db, testStore.id, { code: "QUEIJO_GOUDA", name: "Queijo Gouda", category: "cheese" });

    const contents = {
      "complete-file": await completeWagyuBuffer(),
      "incomplete-file": await incompleteQueijoBuffer(),
    };
    const drive = fakeDrive(treeWithBothFiles, contents);

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

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

    const contents = { "complete-file": await completeWagyuBuffer() };
    const tree = {
      ...treeWithBothFiles,
      desperdicios: [{ id: "complete-file", name: "Desperdicio_Completo.xlsx", type: "file" as const }],
    };
    const drive = fakeDrive(tree, contents);

    const first = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);
    const second = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

    expect(first.processed).toHaveLength(1);
    expect(second.processed).toHaveLength(0);
    expect(second.skippedAlreadyProcessed).toEqual([{ fileId: "complete-file", fileName: "Desperdicio_Completo.xlsx" }]);

    const totals = await inventoryMovementRepo.sumSince(db, supplyW.id, new Date(0));
    expect(totals.waste).toBe(1); // not 2 — the second run didn't reprocess the file
  });

  it("treats an empty (no-data) report as processed, not an error", async () => {
    const testStore = await createTestStore(db);
    const tree = {
      ...treeWithBothFiles,
      desperdicios: [{ id: "incomplete-file", name: "Desperdicio_Incompleto.xlsx", type: "file" as const }],
    };
    const drive = fakeDrive(tree, { "incomplete-file": await buildEmptyWasteReportXlsx("Lista de Desperdício Incompleto") });

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

    expect(result.errors).toEqual([]);
    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]?.result.hasData).toBe(false);
  });

  it("reports a file with an unrecognized name as an error, without guessing which parser to use", async () => {
    const testStore = await createTestStore(db);
    const tree = {
      ...treeWithBothFiles,
      desperdicios: [{ id: "mystery-file", name: "relatorio_estranho.xlsx", type: "file" as const }],
    };
    const drive = fakeDrive(tree, { "mystery-file": Buffer.from("irrelevant") });

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

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
        { id: "complete-1", name: "Desperdicio_Completo.xlsx", type: "file" as const },
        { id: "complete-2", name: "Desperdicio_Completo (1).xlsx", type: "file" as const },
      ],
    };
    const wagyu = await completeWagyuBuffer();
    const contents = {
      "complete-1": wagyu,
      "complete-2": wagyu,
    };
    const drive = fakeDrive(tree, contents);

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

    expect(result.processed).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.error.includes("ambíguo"))).toBe(true);
  });

  it("reports a malformed report as a per-file error without blocking the other file", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "W", name: "Burger de Wagyu de 200g" });

    const contents = {
      "complete-file": await completeWagyuBuffer(),
      "incomplete-file": await buildUnrecognizedWasteReportXlsx(),
    };
    const drive = fakeDrive(treeWithBothFiles, contents);

    const result = await ingestDailyWaste(db, drive, ROOT, testStore.id, date);

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]?.fileId).toBe("complete-file");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.fileId).toBe("incomplete-file");
  });
});
