import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import { createAlert, acknowledgeAlert } from "src/domain/alert.js";

/**
 * Posts the alert to the Store's group (telegram_group_id read from the database, D4 /
 * confirmed decision), not the conversation where the count was confirmed — the alert
 * must always reach the whole group, regardless of where the collaborator sent the count.
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

  const alertCreated = await createAlert(db, params.countId);

  await bot.telegram.sendMessage(
    activeStore.telegramGroupId,
    `⚠️ @all A contagem de "${params.supplyName}" não bateu. Confiram e reconheçam este alerta.`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "✅ Reconheço", callback_data: `acknowledge:${alertCreated.id}` }]],
      },
    },
  );
}

export function registerAlertHandler(bot: Telegraf<Context>, db: Db): void {
  bot.action(/^acknowledge:(.+)$/, async (ctx) => {
    const alertId = (ctx.match as RegExpMatchArray)[1];
    if (!alertId) {
      await ctx.answerCbQuery();
      return;
    }

    const acknowledgedBy = ctx.from?.id?.toString() ?? "unknown";
    await acknowledgeAlert(db, alertId, acknowledgedBy);

    await ctx.answerCbQuery("Reconhecido!");
    await ctx.editMessageText(
      `${(ctx.callbackQuery.message as { text?: string } | undefined)?.text ?? ""}\n\n✅ Reconhecido por ${acknowledgedBy}.`,
    );
  });
}
