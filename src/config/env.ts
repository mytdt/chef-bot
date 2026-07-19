import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTHORIZED_TELEGRAM_IDS: z
    .string()
    .min(1, "AUTHORIZED_TELEGRAM_IDS is required")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ESCALATION_CONTACT_TELEGRAM_ID: z.string().min(1, "ESCALATION_CONTACT_TELEGRAM_ID is required"),
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
  AUTHORIZED_TELEGRAM_IDS: string[];
  ESCALATION_CONTACT_TELEGRAM_ID: string;
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
