import { describe, expect, it } from "vitest";
import { downloadFileContent, type DriveFileContentApi } from "src/salesXml/driveFileContent.js";

function fakeContentApi(contents: Record<string, string>): DriveFileContentApi {
  return {
    async get({ fileId }) {
      const content = contents[fileId];
      if (content === undefined) throw new Error("not found");
      return { data: content };
    },
  };
}

describe("downloadFileContent", () => {
  it("returns the file's raw content", async () => {
    const api = fakeContentApi({ "file-1": "<xml>hello</xml>" });

    const content = await downloadFileContent(api, "file-1");

    expect(content).toBe("<xml>hello</xml>");
  });

  it("propagates errors from the underlying API", async () => {
    const api = fakeContentApi({});

    await expect(downloadFileContent(api, "missing")).rejects.toThrow();
  });
});
