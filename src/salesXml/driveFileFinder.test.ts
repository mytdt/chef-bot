import { describe, expect, it } from "vitest";
import { findDailyNfceFiles, findDailyReceiptFiles, findDailyWasteFiles, type DriveFilesApi } from "src/salesXml/driveFileFinder.js";

/**
 * No real Google Drive credential is available to this session
 * (GOOGLE_SERVICE_ACCOUNT_KEY isn't set — see TRILHA-ENTREGAVEIS.md) — these tests
 * inject a fake DriveFilesApi built from an in-memory folder tree instead of calling
 * the real API. That's why this lives in the regular unit suite (`npm test`), not
 * `*.integration.test.ts`: it never touches a live external system, unlike the
 * Postgres-backed integration tests elsewhere in this project. Real end-to-end
 * verification against the actual Drive folder needs the real credential and is a
 * manual step, not something this suite can cover.
 */
interface FakeNode {
  id: string;
  name: string;
  type: "folder" | "file";
}

function fakeDriveApi(tree: Record<string, FakeNode[]>): DriveFilesApi {
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
      if (nameEquals !== undefined) {
        filtered = filtered.filter((node) => node.name === nameEquals);
      }

      const nameContains = q.match(/name contains '([^']*)'/)?.[1];
      if (nameContains !== undefined) {
        filtered = filtered.filter((node) => node.name.includes(nameContains));
      }

      // Single page — enough for most tests. Pagination is covered separately below.
      return { data: { files: filtered.map((node) => ({ id: node.id, name: node.name })) } };
    },
  };
}

const ROOT = "root-folder-id";
const date = new Date("2026-07-18T12:00:00-03:00");

describe("findDailyNfceFiles", () => {
  it("finds the .xml files under chef-bot/<year>/<month>/<day>/vendas/", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "vendas", name: "vendas", type: "folder" }],
      vendas: [
        { id: "file-1", name: "36177-1-4645600.xml", type: "file" },
        { id: "file-2", name: "36116-1-4642756.xml", type: "file" },
        { id: "not-xml", name: "readme.txt", type: "file" },
      ],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([
      { id: "file-1", name: "36177-1-4645600.xml" },
      { id: "file-2", name: "36116-1-4642756.xml" },
    ]);
  });

  it("falls back to unpadded month/day ('7' instead of '07') when the padded folder isn't found", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-7", name: "7", type: "folder" }], // unpadded, no "07"
      "month-7": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "vendas", name: "vendas", type: "folder" }],
      vendas: [{ id: "file-1", name: "36177-1-4645600.xml", type: "file" }],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([{ id: "file-1", name: "36177-1-4645600.xml" }]);
  });

  it("prefers the padded folder ('07') over unpadded when both exist", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [
        { id: "month-07", name: "07", type: "folder" },
        { id: "month-7", name: "7", type: "folder" },
      ],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "month-7": [{ id: "wrong-day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "vendas", name: "vendas", type: "folder" }],
      "wrong-day-18": [{ id: "wrong-vendas", name: "vendas", type: "folder" }],
      vendas: [{ id: "file-1", name: "correct.xml", type: "file" }],
      "wrong-vendas": [{ id: "file-2", name: "wrong.xml", type: "file" }],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([{ id: "file-1", name: "correct.xml" }]);
  });

  it("returns an empty array when the day folder doesn't exist yet", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [], // no "18" folder yet — e.g. the bot runs before today's folder is created
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([]);
  });

  it("returns an empty array when the month folder doesn't exist yet", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [], // no "07" folder
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([]);
  });

  it("returns an empty array when the day folder exists but has no vendas/ subfolder", async () => {
    // The bug this whole fix addresses: PRs #9/#13 mergeated a version that listed
    // .xml files directly in the day folder, never descending into vendas/ — against a
    // real populated Drive folder (files ARE inside vendas/), that would silently find
    // nothing. This test locks in the corrected behavior: no vendas/ subfolder -> empty
    // result (not an error, and NOT a fallback to files sitting loose in the day folder).
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "file-1", name: "36177-1-4645600.xml", type: "file" }], // loose in day folder, no vendas/
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([]);
  });

  it("excludes files that only contain '.xml' as a substring, not as the actual extension", async () => {
    // Drive's `contains` operator is a substring match — a name like "notes.xml.bak"
    // would pass that query but isn't actually an XML file. The local endsWith(".xml")
    // filter (not just the Drive query) is what catches this.
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "vendas", name: "vendas", type: "folder" }],
      vendas: [
        { id: "file-1", name: "36177-1-4645600.xml", type: "file" },
        { id: "backup", name: "notes.xml.bak", type: "file" },
      ],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([{ id: "file-1", name: "36177-1-4645600.xml" }]);
  });

  it("returns an empty array when vendas/ exists but has no .xml files", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "vendas", name: "vendas", type: "folder" }],
      vendas: [],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([]);
  });

  it("follows nextPageToken across pages (Drive default page size is 100)", async () => {
    // Production bug 2026-07-22: a day with 144 NFC-e was reported as "encontrados: 100"
    // because listFilesInFolder only called files.list() once. This fake returns 100
    // files on page 1 + 44 on page 2, matching Drive's default page size.
    const page1Files = Array.from({ length: 100 }, (_, i) => ({
      id: `file-${i + 1}`,
      name: `sale-${String(i + 1).padStart(3, "0")}.xml`,
    }));
    const page2Files = Array.from({ length: 44 }, (_, i) => ({
      id: `file-${i + 101}`,
      name: `sale-${String(i + 101).padStart(3, "0")}.xml`,
    }));

    const drive: DriveFilesApi = {
      async list({ q, pageToken }) {
        if (q.includes(`mimeType = 'application/vnd.google-apps.folder'`)) {
          const parentId = q.match(/'([^']+)' in parents/)?.[1] ?? "";
          const nameEquals = q.match(/name = '([^']*)'/)?.[1];
          const folders: Record<string, { id: string; name: string }[]> = {
            [ROOT]: [{ id: "year-2026", name: "2026" }],
            "year-2026": [{ id: "month-07", name: "07" }],
            "month-07": [{ id: "day-18", name: "18" }],
            "day-18": [{ id: "vendas", name: "vendas" }],
          };
          const matches = (folders[parentId] ?? []).filter((f) => f.name === nameEquals);
          return { data: { files: matches } };
        }

        // File listing under vendas — paginate.
        if (!pageToken) {
          return { data: { files: page1Files, nextPageToken: "page-2" } };
        }
        if (pageToken === "page-2") {
          return { data: { files: page2Files } };
        }
        throw new Error(`Unexpected pageToken: ${pageToken}`);
      },
    };

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toHaveLength(144);
    expect(result[0]).toEqual({ id: "file-1", name: "sale-001.xml" });
    expect(result[99]).toEqual({ id: "file-100", name: "sale-100.xml" });
    expect(result[100]).toEqual({ id: "file-101", name: "sale-101.xml" });
    expect(result[143]).toEqual({ id: "file-144", name: "sale-144.xml" });
  });
});

describe("findDailyReceiptFiles", () => {
  it("finds the .xlsx files under chef-bot/<year>/<month>/<day>/recebimentos/", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "recebimentos", name: "recebimentos", type: "folder" }],
      recebimentos: [
        { id: "file-1", name: "Notas_Fornecedores.xlsx", type: "file" },
        { id: "file-xml", name: "legacy-nfe.xml", type: "file" },
      ],
    });

    const result = await findDailyReceiptFiles(drive, ROOT, date);

    expect(result).toEqual([{ id: "file-1", name: "Notas_Fornecedores.xlsx" }]);
  });

  it("returns an empty array when the day folder has no recebimentos/ subfolder", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "vendas", name: "vendas", type: "folder" }], // vendas exists, recebimentos doesn't
      vendas: [],
    });

    const result = await findDailyReceiptFiles(drive, ROOT, date);

    expect(result).toEqual([]);
  });
});

describe("findDailyWasteFiles", () => {
  it("classifies XLSXs under desperdicios/ into complete/incomplete by filename", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" }],
      desperdicios: [
        { id: "file-complete", name: "Desperdicio_Completo.xlsx", type: "file" },
        { id: "file-incomplete", name: "Desperdicio_Incompleto.xlsx", type: "file" },
      ],
    });

    const result = await findDailyWasteFiles(drive, ROOT, date);

    expect(result.complete).toEqual([{ id: "file-complete", name: "Desperdicio_Completo.xlsx" }]);
    expect(result.incomplete).toEqual([{ id: "file-incomplete", name: "Desperdicio_Incompleto.xlsx" }]);
    expect(result.unrecognized).toEqual([]);
  });

  it("classifies 'Incompleto' correctly even though 'completo' is a substring of it", async () => {
    // The classic substring trap: "Incompleto".toLowerCase().includes("completo") is
    // true, so a naive "completo" check (without checking "incompleto" first) would
    // misfile every Incompleto report as Completo.
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" }],
      desperdicios: [{ id: "file-incomplete", name: "relatorio_incompleto.xlsx", type: "file" }],
    });

    const result = await findDailyWasteFiles(drive, ROOT, date);

    expect(result.incomplete).toEqual([{ id: "file-incomplete", name: "relatorio_incompleto.xlsx" }]);
    expect(result.complete).toEqual([]);
  });

  it("puts a file matching neither pattern into unrecognized", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" }],
      desperdicios: [{ id: "file-mystery", name: "relatorio_estranho.xlsx", type: "file" }],
    });

    const result = await findDailyWasteFiles(drive, ROOT, date);

    expect(result.unrecognized).toEqual([{ id: "file-mystery", name: "relatorio_estranho.xlsx" }]);
    expect(result.complete).toEqual([]);
    expect(result.incomplete).toEqual([]);
  });

  it("does not deduplicate more than one file per category — leaves that to the caller", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" }],
      desperdicios: [
        { id: "file-1", name: "Desperdicio_Completo.xlsx", type: "file" },
        { id: "file-2", name: "Desperdicio_Completo (1).xlsx", type: "file" },
      ],
    });

    const result = await findDailyWasteFiles(drive, ROOT, date);

    expect(result.complete).toHaveLength(2);
  });

  it("excludes non-.xlsx files even if they contain a recognized keyword", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [{ id: "desperdicios", name: "desperdicios", type: "folder" }],
      desperdicios: [
        { id: "file-1", name: "Desperdicio_Completo.xlsx", type: "file" },
        { id: "backup", name: "Desperdicio_Completo.xlsx.bak", type: "file" },
        { id: "legacy-pdf", name: "Desperdicio_Completo.pdf", type: "file" },
      ],
    });

    const result = await findDailyWasteFiles(drive, ROOT, date);

    expect(result.complete).toEqual([{ id: "file-1", name: "Desperdicio_Completo.xlsx" }]);
  });

  it("returns all-empty when the day folder has no desperdicios/ subfolder", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [],
    });

    const result = await findDailyWasteFiles(drive, ROOT, date);

    expect(result).toEqual({ complete: [], incomplete: [], unrecognized: [] });
  });
});
