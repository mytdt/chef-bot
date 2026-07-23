import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  // Optional (C5/D10): the Gemini fallback only activates when this is set — without
  // it, the bot still works, just without a fallback if Claude is down.
  GEMINI_API_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Required as of B3 bot integration: /ingest_xml (handlers/ingestXml.ts) wires the
  // Google Drive client into the running bot, so these are load-bearing now — no
  // longer optional the way they were when B2 only had unit-tested, unwired code.
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1, "GOOGLE_SERVICE_ACCOUNT_KEY is required"),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(1, "GOOGLE_DRIVE_ROOT_FOLDER_ID is required"),
  // B3 bot integration: comma-separated Telegram user ids allowed to run /ingest_xml.
  // Optional — an empty list just means nobody can run the command yet, not a boot
  // failure.
  ADMIN_TELEGRAM_IDS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
});

export type Env = {
  BOT_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY?: string;
  DATABASE_URL: string;
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
  GOOGLE_DRIVE_ROOT_FOLDER_ID: string;
  ADMIN_TELEGRAM_IDS: string[];
};

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${messages.join("\n")}`);
  }
  return result.data;
}
