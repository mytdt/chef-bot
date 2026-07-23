import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ingestDailyReceipts } from "src/salesXml/dailyReceiptIngestion.js";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileContentApi } from "src/salesXml/driveFileContent.js";
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

function fakeDrive(tree: Record<string, FakeNode[]>, contents: Record<string, string>): DriveFilesApi & DriveFileContentApi {
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
    async get({ fileId }) {
      const content = contents[fileId];
      if (content === undefined) throw new Error(`No fake content for file ${fileId}`);
      return { data: content };
    },
  };
}

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

const treeWithOneFile = {
  [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" as const }],
  "year-2026": [{ id: "month-07", name: "07", type: "folder" as const }],
  "month-07": [{ id: "day-18", name: "18", type: "folder" as const }],
  "day-18": [{ id: "recebimentos", name: "recebimentos", type: "folder" as const }],
  recebimentos: [{ id: "file-1", name: "35260761559589-nfe.xml", type: "file" as const }],
};

describe("ingestDailyReceipts", () => {
  it("returns an empty result (not an error) when the day folder doesn't exist yet", async () => {
    const testStore = await createTestStore(db);
    const drive = fakeDrive({ [ROOT]: [] }, {});

    const result = await ingestDailyReceipts(db, drive, ROOT, testStore.id, date);

    expect(result.totalFilesFound).toBe(0);
    expect(result.processed).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("reports malformed XML as a per-file error without blocking the other files in the batch", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger de 160g", unitsPerBox: 36 });

    const tree = {
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" as const }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" as const }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" as const }],
      "day-18": [{ id: "recebimentos", name: "recebimentos", type: "folder" as const }],
      recebimentos: [
        { id: "good-file", name: "good.xml", type: "file" as const },
        { id: "bad-file", name: "bad.xml", type: "file" as const },
      ],
    };
    const contents = {
      "good-file": nfe55Xml({ items: [{ cProd: "052700.0160006", qCom: "26.0000" }] }),
      "bad-file": "<not-even-close-to-xml",
    };
    const drive = fakeDrive(tree, contents);

    const result = await ingestDailyReceipts(db, drive, ROOT, testStore.id, date);

    expect(result.totalFilesFound).toBe(2);
    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]?.fileId).toBe("good-file");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.fileId).toBe("bad-file");
  });

  it("does not duplicate InventoryMovement when run twice for the same day (idempotency)", async () => {
    const testStore = await createTestStore(db);
    const supplyG = await createTestSupply(db, testStore.id, { code: "G", name: "Burger de 160g", unitsPerBox: 36 });

    const contents = { "file-1": nfe55Xml({ items: [{ cProd: "052700.0160006", qCom: "26.0000" }] }) };
    const drive = fakeDrive(treeWithOneFile, contents);

    const first = await ingestDailyReceipts(db, drive, ROOT, testStore.id, date);
    const second = await ingestDailyReceipts(db, drive, ROOT, testStore.id, date);

    expect(first.processed).toHaveLength(1);
    expect(first.skippedAlreadyProcessed).toHaveLength(0);

    expect(second.processed).toHaveLength(0);
    expect(second.skippedAlreadyProcessed).toHaveLength(1);
    expect(second.skippedAlreadyProcessed[0]?.fileId).toBe("file-1");

    const totals = await inventoryMovementRepo.sumSince(db, supplyG.id, new Date(0));
    expect(totals.receipts).toBe(26 * 36); // not doubled — the second run didn't reprocess the file
  });

  it("retries a file that previously errored, without re-running files that already succeeded", async () => {
    const testStore = await createTestStore(db);
    await createTestSupply(db, testStore.id, { code: "G", name: "Burger de 160g", unitsPerBox: 36 });

    const tree = {
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" as const }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" as const }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" as const }],
      "day-18": [{ id: "recebimentos", name: "recebimentos", type: "folder" as const }],
      recebimentos: [
        { id: "good-file", name: "good.xml", type: "file" as const },
        { id: "bad-file", name: "bad.xml", type: "file" as const },
      ],
    };
    const contents: Record<string, string> = {
      "good-file": nfe55Xml({ items: [{ cProd: "052700.0160006", qCom: "26.0000" }] }),
      "bad-file": "<not-even-close-to-xml",
    };
    const drive = fakeDrive(tree, contents);

    const first = await ingestDailyReceipts(db, drive, ROOT, testStore.id, date);
    expect(first.processed).toHaveLength(1);
    expect(first.errors).toHaveLength(1);

    // "Fix" the bad file, as if someone corrected it in Drive between runs.
    contents["bad-file"] = nfe55Xml({ items: [{ cProd: "052700.0090006", qCom: "7.0000" }] });

    const second = await ingestDailyReceipts(db, drive, ROOT, testStore.id, date);

    expect(second.skippedAlreadyProcessed).toHaveLength(1);
    expect(second.skippedAlreadyProcessed[0]?.fileId).toBe("good-file");
    expect(second.processed).toHaveLength(1);
    expect(second.processed[0]?.fileId).toBe("bad-file");
    expect(second.errors).toHaveLength(0);
  });
});
