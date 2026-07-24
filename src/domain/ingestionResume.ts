import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import * as awaitingIngestionCountRepo from "src/persistence/repositories/awaitingIngestionCountRepo.js";
import { processConfirmedItems, formatCountBatchReply } from "src/domain/countBatch.js";

/**
 * B3 bot integration: confirmed answer to the open UX question ("retomar sozinha
 * automaticamente") — once /ingest_xml finishes for a date, every count that was
 * parked waiting for that date's XML (handlers/confirmation.ts) is processed right
 * away, with no action needed from the collaborator who originally sent it.
 */
export async function resumeAwaitingCounts(
  bot: Telegraf<Context>,
  db: Db,
  storeId: string,
  date: string,
): Promise<number> {
  const waiting = await awaitingIngestionCountRepo.listByStoreAndDate(db, storeId, date);

  for (const entry of waiting) {
    const summary = await processConfirmedItems(db, bot, {
      storeId: entry.storeId,
      routineId: entry.routineId,
      collaboratorTelegramId: entry.collaboratorTelegramId,
      confirmedByTelegramId: entry.confirmedByTelegramId,
      rawText: entry.rawText,
      llmUsed: entry.llmUsed,
      items: entry.items,
    });

    await bot.telegram.sendMessage(
      entry.chatId,
      `📦 A ingestão do XML de ${date} terminou — aqui está o resultado da sua contagem pendente:\n\n${formatCountBatchReply(summary)}`,
    );

    await awaitingIngestionCountRepo.deleteById(db, entry.id);
  }

  return waiting.length;
}
