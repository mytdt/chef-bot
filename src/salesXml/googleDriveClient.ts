import { google, type drive_v3 } from "googleapis";

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
