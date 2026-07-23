import type { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileContentApi, DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";

/**
 * GOOGLE_SERVICE_ACCOUNT_KEY (DECISIONS.md, 21/07) can be the raw service account JSON
 * or a base64-encoded copy of it — never a .json file in the repo. Accept both so
 * whoever sets the env var doesn't have to worry about shell-escaping raw JSON.
 */
export function parseServiceAccountKey(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf-8");
  return JSON.parse(jsonText) as Record<string, unknown>;
}

export function createDriveClient(serviceAccountKeyRaw: string): drive_v3.Drive {
  const credentials = parseServiceAccountKey(serviceAccountKeyRaw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

async function collectStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/**
 * B3 bot integration: bridges the real googleapis client to the narrow DriveFilesApi +
 * DriveFileContentApi + DriveFileBinaryContentApi interfaces salesXml/*.ts and
 * wastePdf/*.ts are written against. Isolated here (rather than in index.ts) because
 * this is the one module allowed to know about real googleapis types.
 *
 * `files.get({ alt: "media" })` only has a typed overload for `responseType: "stream"`
 * (googleapis has no "text" option, despite what a previous version of this codebase's
 * DriveFileContentApi implied) — every download goes through the same stream-collecting
 * helper, then each of the two API shapes decides what to do with the resulting Buffer:
 * `get()` decodes it as UTF-8 text (correct for XML), `getBinary()` returns it as-is
 * (required for PDFs — UTF-8-decoding binary content would corrupt it).
 */
export function createDriveFilesAndContentApi(
  serviceAccountKeyRaw: string,
): DriveFilesApi & DriveFileContentApi & DriveFileBinaryContentApi {
  const drive = createDriveClient(serviceAccountKeyRaw);

  async function downloadRaw(fileId: string): Promise<Buffer> {
    const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    const stream = response.data as unknown as Readable;
    return collectStreamToBuffer(stream);
  }

  return {
    list: (params) => drive.files.list(params),
    async get({ fileId }) {
      const buffer = await downloadRaw(fileId);
      return { data: buffer.toString("utf-8") };
    },
    getBinary: (fileId) => downloadRaw(fileId),
  };
}
