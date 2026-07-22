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
 * Month/day are assumed zero-padded (e.g. "07", not "7") — matches the local sample
 * folder layout seen in B0 (`.../2026/07/18/`), but this wasn't explicitly reconfirmed
 * for the corrected `chef-bot/...` convention. Flagged in TRILHA-ENTREGAVEIS.md.
 *
 * Returns an empty array if any segment of the date path doesn't exist yet (e.g. the
 * day's folder hasn't been created) — that's not an error, just "no files yet". Deciding
 * what to do about an empty result (retry later? alert?) is a B3 concern, not this
 * function's.
 */
export async function findDailyNfceFiles(files: DriveFilesApi, rootFolderId: string, date: Date): Promise<DriveFileRef[]> {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let currentFolderId = rootFolderId;
  for (const segment of [year, month, day]) {
    const childFolderId = await findChildFolderId(files, currentFolderId, segment);
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
