import { describe, expect, it } from "vitest";
import {
  downloadFileContent,
  downloadBinaryFileContent,
  type DriveFileContentApi,
  type DriveFileBinaryContentApi,
} from "src/salesXml/driveFileContent.js";

function fakeContentApi(contents: Record<string, string>): DriveFileContentApi {
  return {
    async get({ fileId }) {
      const content = contents[fileId];
      if (content === undefined) throw new Error("not found");
      return { data: content };
    },
  };
}

function fakeBinaryContentApi(contents: Record<string, Buffer>): DriveFileBinaryContentApi {
  return {
    async getBinary(fileId) {
      const content = contents[fileId];
      if (content === undefined) throw new Error("not found");
      return content;
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

describe("downloadBinaryFileContent", () => {
  it("returns the file's raw bytes, undecoded", async () => {
    // Bytes that are not valid UTF-8 on their own (a lone continuation byte) — proves
    // this path doesn't run anything through string decoding, unlike downloadFileContent.
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80]);
    const api = fakeBinaryContentApi({ "file-1": bytes });

    const content = await downloadBinaryFileContent(api, "file-1");

    expect(Buffer.compare(content, bytes)).toBe(0);
  });

  it("propagates errors from the underlying API", async () => {
    const api = fakeBinaryContentApi({});

    await expect(downloadBinaryFileContent(api, "missing")).rejects.toThrow();
  });
});
