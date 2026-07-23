import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import type { AggregatedCountItem } from "src/bot/parse.schema.js";
import type { LlmProvider } from "src/domain/types.js";
import { processCountItem } from "src/domain/count.js";
import { postAlertToGroup } from "src/bot/handlers/alert.js";

export interface CountBatchSummary {
  matched: string[];
  notMatched: string[];
  invalidQuantities: string[];
  notFound: string[];
}

/**
 * Shared by the immediate-confirmation path (handlers/confirmation.ts) and the
 * ingestion-resume path (domain/ingestionResume.ts, B3 bot integration) — both process
 * a confirmed batch of items the same way, they just differ in what to do with the
 * resulting summary (reply inline vs. send a fresh message once ingestion catches up).
 *
 * `items` are already post-conversion aggregates (awaiting stores that shape too).
 */
export async function processConfirmedItems(
  db: Db,
  bot: Telegraf<Context>,
  params: {
    storeId: string;
    routineId: string;
    collaboratorTelegramId: string;
    rawText: string;
    llmUsed: LlmProvider;
    items: AggregatedCountItem[];
  },
): Promise<CountBatchSummary> {
  const summary: CountBatchSummary = { matched: [], notMatched: [], invalidQuantities: [], notFound: [] };

  for (const item of params.items) {
    const result = await processCountItem(db, {
      storeId: params.storeId,
      routineId: params.routineId,
      collaboratorTelegramId: params.collaboratorTelegramId,
      rawText: params.rawText,
      llmUsed: params.llmUsed,
      item,
    });

    if (!result.found) {
      summary.notFound.push(result.supplyTextOriginal);
      continue;
    }

    const displayName = result.supplyName ?? result.supplyTextOriginal;

    if (result.invalidQuantity) {
      summary.invalidQuantities.push(displayName);
      continue;
    }

    if (result.matched) {
      summary.matched.push(displayName);
    } else {
      summary.notMatched.push(displayName);
      if (result.countId) {
        await postAlertToGroup(bot, db, { countId: result.countId, supplyName: displayName });
      }
    }
  }

  return summary;
}

// Blind count: the reply to the collaborator never mentions the expected value.
export function formatCountBatchReply(summary: CountBatchSummary): string {
  const parts: string[] = [];
  if (summary.matched.length > 0) {
    parts.push(`✅ Tudo certo: ${summary.matched.join(", ")}.`);
  }
  if (summary.notMatched.length > 0) {
    parts.push(`🚨 Alerta enviado ao grupo para: ${summary.notMatched.join(", ")}.`);
  }
  if (summary.invalidQuantities.length > 0) {
    parts.push(`⚠️ Quantidade precisa ser um número inteiro para: ${summary.invalidQuantities.join(", ")}.`);
  }
  if (summary.notFound.length > 0) {
    parts.push(`⚠️ Insumo não encontrado no cadastro: ${summary.notFound.join(", ")}.`);
  }
  return parts.join("\n") || "Nada para registrar.";
}
