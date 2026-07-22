import { describe, expect, it } from "vitest";
import { parseServiceAccountKey } from "src/salesXml/googleDriveClient.js";

describe("parseServiceAccountKey", () => {
  it("parses a raw JSON string", () => {
    const raw = JSON.stringify({ type: "service_account", client_email: "bot@project.iam.gserviceaccount.com" });

    expect(parseServiceAccountKey(raw)).toEqual({
      type: "service_account",
      client_email: "bot@project.iam.gserviceaccount.com",
    });
  });

  it("parses a base64-encoded JSON string", () => {
    const json = JSON.stringify({ type: "service_account", client_email: "bot@project.iam.gserviceaccount.com" });
    const base64 = Buffer.from(json, "utf-8").toString("base64");

    expect(parseServiceAccountKey(base64)).toEqual({
      type: "service_account",
      client_email: "bot@project.iam.gserviceaccount.com",
    });
  });

  it("throws on a value that's neither valid JSON nor valid base64-encoded JSON", () => {
    expect(() => parseServiceAccountKey("not json and not base64 json either")).toThrow();
  });
});
