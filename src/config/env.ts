import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN é obrigatório"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY é obrigatório"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  AUTHORIZED_TELEGRAM_IDS: z
    .string()
    .min(1, "AUTHORIZED_TELEGRAM_IDS é obrigatório")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  RESPONSAVEL_ESCALONAMENTO_TELEGRAM_ID: z.string().min(1, "RESPONSAVEL_ESCALONAMENTO_TELEGRAM_ID é obrigatório"),
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
  RESPONSAVEL_ESCALONAMENTO_TELEGRAM_ID: string;
  ALERT_TIMEOUT_MINUTES: number;
};

export function carregarEnv(): Env {
  const resultado = envSchema.safeParse(process.env);
  if (!resultado.success) {
    const mensagens = resultado.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Configuração de ambiente inválida:\n${mensagens.join("\n")}`);
  }
  return resultado.data;
}
