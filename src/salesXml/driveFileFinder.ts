export interface DriveFileRef {
  id: string;
  name: string;
}

/**
 * Narrow slice of the googleapis Drive client this module actually calls (just
 * `files.list`) — lets tests inject a fake without depending on googleapis' full,
 * network-backed client shape. `drive_v3.Drive["files"]` satisfies this structurally.
 */
export interface DriveFilesApi {
  list(params: { q: string; fields?: string }): Promise<{
    data: { files?: { id?: string | null; name?: string | null }[] };
  }>;
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const SALES_SUBFOLDER_NAME = "vendas";
const RECEIPTS_SUBFOLDER_NAME = "recebimentos";
const WASTE_SUBFOLDER_NAME = "desperdicios";

function escapeForDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function findChildFolderId(files: DriveFilesApi, parentFolderId: string, name: string): Promise<string | null> {
  const response = await files.list({
    q: `'${parentFolderId}' in parents and name = '${escapeForDriveQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    fields: "files(id, name)",
  });
  const found = response.data.files?.[0];
  return found?.id ?? null;
}

// D11 addendum (2026-07-21): zero-padding ("07") is confirmed correct, but as a
// robustness measure, fall back to the unpadded form ("7") before giving up if the
// padded name isn't found — not a real ambiguity anymore, just defensive.
async function findChildFolderIdWithFallback(
  files: DriveFilesApi,
  parentFolderId: string,
  primary: string,
  fallback: string,
): Promise<string | null> {
  const found = await findChildFolderId(files, parentFolderId, primary);
  if (found) {
    return found;
  }
  if (fallback === primary) {
    return null;
  }
  return findChildFolderId(files, parentFolderId, fallback);
}

/**
 * Navigates from the shared root folder down to the day's folder
 * (`<year>/<month>/<day>/`), applying the zero-padding fallback to month/day. Shared by
 * all three per-type finders below — the year/month/day path is identical for
 * vendas/recebimentos/desperdicios, only the subfolder-by-type step after this differs.
 *
 * Month/day are zero-padded (e.g. "07", not "7") — confirmed by Emanoel (2026-07-21)
 * against the real Drive folder, with the unpadded form tried as a fallback (also
 * requested) before giving up on a segment.
 *
 * Returns null if any segment of the date path doesn't exist yet (e.g. the day's folder
 * hasn't been created) — that's not an error, just "no files yet".
 */
async function findDayFolderId(files: DriveFilesApi, rootFolderId: string, date: Date): Promise<string | null> {
  const year = String(date.getFullYear());
  const monthPadded = String(date.getMonth() + 1).padStart(2, "0");
  const monthUnpadded = String(date.getMonth() + 1);
  const dayPadded = String(date.getDate()).padStart(2, "0");
  const dayUnpadded = String(date.getDate());

  const yearFolderId = await findChildFolderId(files, rootFolderId, year);
  if (!yearFolderId) {
    return null;
  }

  let currentFolderId = yearFolderId;
  const segmentsWithFallback: [primary: string, fallback: string][] = [
    [monthPadded, monthUnpadded],
    [dayPadded, dayUnpadded],
  ];
  for (const [primary, fallback] of segmentsWithFallback) {
    const childFolderId = await findChildFolderIdWithFallback(files, currentFolderId, primary, fallback);
    if (!childFolderId) {
      return null;
    }
    currentFolderId = childFolderId;
  }
  return currentFolderId;
}

/**
 * Lists files directly under `folderId` whose name ends with `extension` (case
 * insensitive). Drive's `contains` operator is a substring match, not a suffix match —
 * filtering by actual suffix locally (not just trusting the query) catches a name like
 * "notes.xml.bak" that would otherwise pass a `contains '.xml'` query.
 */
async function listFilesInFolder(files: DriveFilesApi, folderId: string, extension: string): Promise<DriveFileRef[]> {
  const response = await files.list({
    q: `'${folderId}' in parents and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false and name contains '${extension}'`,
    fields: "files(id, name)",
  });
  return (response.data.files ?? [])
    .filter((file): file is { id: string; name: string } => Boolean(file.id && file.name))
    .filter((file) => file.name.toLowerCase().endsWith(extension))
    .map((file) => ({ id: file.id, name: file.name }));
}

/**
 * Locates the sales .xml files (NFC-e) for a given date, following the real folder
 * convention confirmed 2026-07-22: `chef-bot/<year>/<month>/<day>/vendas/*.xml` — a
 * `vendas/` subfolder under the day, not directly in the day folder as an earlier
 * (wrong) version of this function assumed. That earlier version was merged (PR #9) and
 * never caught by tests because end-to-end validation only ever ran against an empty
 * Drive folder — with real, populated data it would have found nothing. This fixes it.
 *
 * storeId is deliberately NOT a parameter: the folder convention has no `<loja>`
 * segment (single shared folder, consistent with D4 — one store for now).
 */
export async function findDailyNfceFiles(files: DriveFilesApi, rootFolderId: string, date: Date): Promise<DriveFileRef[]> {
  const dayFolderId = await findDayFolderId(files, rootFolderId, date);
  if (!dayFolderId) {
    return [];
  }
  const salesFolderId = await findChildFolderId(files, dayFolderId, SALES_SUBFOLDER_NAME);
  if (!salesFolderId) {
    return [];
  }
  return listFilesInFolder(files, salesFolderId, ".xml");
}

/**
 * B5: locates the receiving-note .xml files (NFe modelo 55) for a given date, under
 * `chef-bot/<year>/<month>/<day>/recebimentos/*.xml`.
 */
export async function findDailyReceiptFiles(files: DriveFilesApi, rootFolderId: string, date: Date): Promise<DriveFileRef[]> {
  const dayFolderId = await findDayFolderId(files, rootFolderId, date);
  if (!dayFolderId) {
    return [];
  }
  const receiptsFolderId = await findChildFolderId(files, dayFolderId, RECEIPTS_SUBFOLDER_NAME);
  if (!receiptsFolderId) {
    return [];
  }
  return listFilesInFolder(files, receiptsFolderId, ".xml");
}

export interface CategorizedWasteFiles {
  complete: DriveFileRef[];
  incomplete: DriveFileRef[];
  unrecognized: DriveFileRef[];
}

/**
 * "incompleto" is checked before "completo" — "completo" is a substring of
 * "incompleto" ("in-completo"), so checking in the other order would misclassify every
 * Incompleto report as Completo.
 */
function classifyWasteFileName(name: string): "complete" | "incomplete" | null {
  const lower = name.toLowerCase();
  if (lower.includes("incompleto")) {
    return "incomplete";
  }
  if (lower.includes("completo")) {
    return "complete";
  }
  return null;
}

/**
 * B6: locates the two daily waste-report PDFs ("Completo" and "Incompleto") under
 * `chef-bot/<year>/<month>/<day>/desperdicios/*.pdf`, classified by filename (confirmed
 * naming, 22/07: the file names contain "Completo" or "Incompleto").
 *
 * Deliberately does NOT collapse this into a flat list + let the caller guess which
 * file is which — classification happens once, here, so every caller sees the same
 * answer. A file that matches neither pattern lands in `unrecognized` rather than being
 * silently dropped or guessed at; more than one file in `complete`/`incomplete` is also
 * possible (not deduplicated here) — deciding what "more than expected" means is
 * dailyWasteIngestion.ts's job (per-file error, not a crash), not this function's.
 */
export async function findDailyWasteFiles(files: DriveFilesApi, rootFolderId: string, date: Date): Promise<CategorizedWasteFiles> {
  const empty: CategorizedWasteFiles = { complete: [], incomplete: [], unrecognized: [] };
  const dayFolderId = await findDayFolderId(files, rootFolderId, date);
  if (!dayFolderId) {
    return empty;
  }
  const wasteFolderId = await findChildFolderId(files, dayFolderId, WASTE_SUBFOLDER_NAME);
  if (!wasteFolderId) {
    return empty;
  }

  const pdfFiles = await listFilesInFolder(files, wasteFolderId, ".pdf");
  const result: CategorizedWasteFiles = { complete: [], incomplete: [], unrecognized: [] };
  for (const file of pdfFiles) {
    const category = classifyWasteFileName(file.name);
    if (category === "complete") {
      result.complete.push(file);
    } else if (category === "incomplete") {
      result.incomplete.push(file);
    } else {
      result.unrecognized.push(file);
    }
  }
  return result;
}
