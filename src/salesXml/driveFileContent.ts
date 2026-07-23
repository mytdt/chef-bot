/**
 * Narrow slice of the googleapis Drive client for downloading a file's raw content —
 * separate from DriveFilesApi (driveFileFinder.ts, which only lists/searches) so each
 * interface stays minimal and easy to fake in tests.
 */
export interface DriveFileContentApi {
  get(params: { fileId: string; alt: "media" }, options: { responseType: "text" }): Promise<{ data: string }>;
}

export async function downloadFileContent(files: DriveFileContentApi, fileId: string): Promise<string> {
  const response = await files.get({ fileId, alt: "media" }, { responseType: "text" });
  return response.data;
}

/**
 * Separate from DriveFileContentApi: that interface always decodes the response as
 * UTF-8 text, which is correct for XML (B1/B5) but would corrupt binary content — a
 * PDF (B6) run through `.toString("utf-8")` is not recoverable, since arbitrary binary
 * bytes aren't valid UTF-8. wastePdf/dailyWasteIngestion.ts needs the raw bytes to hand
 * to `pdf-parse`, not a mangled string.
 */
export interface DriveFileBinaryContentApi {
  getBinary(fileId: string): Promise<Buffer>;
}

export async function downloadBinaryFileContent(files: DriveFileBinaryContentApi, fileId: string): Promise<Buffer> {
  return files.getBinary(fileId);
}
