import { describe, expect, it } from "vitest";
import { findDailyNfceFiles, type DriveFilesApi } from "src/salesXml/driveFileFinder.js";

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

      return { data: { files: filtered.map((node) => ({ id: node.id, name: node.name })) } };
    },
  };
}

const ROOT = "root-folder-id";
const date = new Date("2026-07-18T12:00:00-03:00");

describe("findDailyNfceFiles", () => {
  it("finds the .xml files under chef-bot/<year>/<month>/<day>/", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [
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
      "day-18": [{ id: "file-1", name: "36177-1-4645600.xml", type: "file" }],
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
      "day-18": [{ id: "file-1", name: "correct.xml", type: "file" }],
      "wrong-day-18": [{ id: "file-2", name: "wrong.xml", type: "file" }],
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

  it("excludes files that only contain '.xml' as a substring, not as the actual extension", async () => {
    // Drive's `contains` operator is a substring match — a name like "notes.xml.bak"
    // would pass that query but isn't actually an XML file. The local endsWith(".xml")
    // filter (not just the Drive query) is what catches this.
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [
        { id: "file-1", name: "36177-1-4645600.xml", type: "file" },
        { id: "backup", name: "notes.xml.bak", type: "file" },
      ],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([{ id: "file-1", name: "36177-1-4645600.xml" }]);
  });

  it("returns an empty array when the day folder exists but has no .xml files", async () => {
    const drive = fakeDriveApi({
      [ROOT]: [{ id: "year-2026", name: "2026", type: "folder" }],
      "year-2026": [{ id: "month-07", name: "07", type: "folder" }],
      "month-07": [{ id: "day-18", name: "18", type: "folder" }],
      "day-18": [],
    });

    const result = await findDailyNfceFiles(drive, ROOT, date);

    expect(result).toEqual([]);
  });
});
