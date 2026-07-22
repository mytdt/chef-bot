import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional (Módulo B / B2): not required yet because nothing in the current boot
  // path (index.ts) consumes them — the Google Drive ingestion isn't wired into the
  // running bot until B3. Making them required here would break `bot.launch()` for
  // everyone today just to satisfy a feature that isn't triggered yet. Revisit once
  // B3 adds the daily ingestion job to index.ts.
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(1).optional(),
  ALERT_TIMEOUT_MINUTES: z
    .string()
    .default("15")
    .transform((value) => Number(value))
    .pipe(z.number().positive()),
});

export type Env = {
  BOT_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  DATABASE_URL: string;
  GOOGLE_SERVICE_ACCOUNT_KEY?: string;
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
  ALERT_TIMEOUT_MINUTES: number;
};

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${messages.join("\n")}`);
  }
  return result.data;
}
