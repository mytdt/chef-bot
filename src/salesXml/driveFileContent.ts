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
