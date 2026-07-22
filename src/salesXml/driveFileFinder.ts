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
 * Locates the .xml files for a given date under the shared root folder, following the
 * corrected convention (DECISIONS.md, 2026-07-21): `chef-bot/<year>/<month>/<day>/*.xml`
 * — no per-store path segment, since it's a single shared folder for now (D4-consistent:
 * multi-store would need a different mechanism, not a bigger job for this function).
 *
 * storeId is deliberately NOT a parameter here: the corrected folder convention has no
 * `<loja>` segment, so it wouldn't affect the path — a param B2 never uses just to match
 * the literal wording of the request would be dead weight. If the project moves to
 * per-store Drive folders later, that's a real design change (e.g. a `driveFolderId`
 * column on `store`), not something to stub in now.
 *
 * Month/day are zero-padded (e.g. "07", not "7") — confirmed by Emanoel (2026-07-21)
 * against the real Drive folder. As a robustness measure (also requested), the
 * unpadded form is tried as a fallback before giving up on a segment.
 *
 * Returns an empty array if any segment of the date path doesn't exist yet (e.g. the
 * day's folder hasn't been created) — that's not an error, just "no files yet". Deciding
 * what to do about an empty result (retry later? alert?) is a B3 concern, not this
 * function's.
 */
export async function findDailyNfceFiles(files: DriveFilesApi, rootFolderId: string, date: Date): Promise<DriveFileRef[]> {
  const year = String(date.getFullYear());
  const monthPadded = String(date.getMonth() + 1).padStart(2, "0");
  const monthUnpadded = String(date.getMonth() + 1);
  const dayPadded = String(date.getDate()).padStart(2, "0");
  const dayUnpadded = String(date.getDate());

  let currentFolderId = rootFolderId;

  const yearFolderId = await findChildFolderId(files, currentFolderId, year);
  if (!yearFolderId) {
    return [];
  }
  currentFolderId = yearFolderId;

  const segmentsWithFallback: [primary: string, fallback: string][] = [
    [monthPadded, monthUnpadded],
    [dayPadded, dayUnpadded],
  ];
  for (const [primary, fallback] of segmentsWithFallback) {
    const childFolderId = await findChildFolderIdWithFallback(files, currentFolderId, primary, fallback);
    if (!childFolderId) {
      return [];
    }
    currentFolderId = childFolderId;
  }

  const response = await files.list({
    q: `'${currentFolderId}' in parents and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false and name contains '.xml'`,
    fields: "files(id, name)",
  });

  // Drive's `contains` operator is a substring match, not a suffix match (and this
  // module has no control over what else lives in that folder) — filter by actual
  // ".xml" suffix locally instead of trusting the query alone.
  return (response.data.files ?? [])
    .filter((file): file is { id: string; name: string } => Boolean(file.id && file.name))
    .filter((file) => file.name.toLowerCase().endsWith(".xml"))
    .map((file) => ({ id: file.id, name: file.name }));
}
