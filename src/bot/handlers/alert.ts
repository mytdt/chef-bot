import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import { createAlert } from "src/domain/alert.js";

/**
 * Posts the alert to the Store's group (telegram_group_id read from the database, D4 /
 * confirmed decision), not the conversation where the count was confirmed — the alert
 * must always reach the whole group, regardless of where the collaborator sent the count.
 *
 * C6: a one-shot notification, no acknowledgment button and no escalation follow-up
 * (removed, amends D2/D12).
 */
export async function postAlertToGroup(
  bot: Telegraf<Context>,
  db: Db,
  params: { countId: string; supplyName: string },
): Promise<void> {
  const activeStore = await storeRepo.findActiveStore(db);
  if (!activeStore) {
    throw new Error("No active store found — could not post the alert to the group.");
  }

  await createAlert(db, params.countId);

  await bot.telegram.sendMessage(
    activeStore.telegramGroupId,
    `⚠️ @all A contagem de "${params.supplyName}" não bateu. Confiram, por favor.`,
  );
}
