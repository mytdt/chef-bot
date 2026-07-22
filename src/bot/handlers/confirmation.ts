import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import { consumePending } from "src/bot/pendingCounts.js";
import { processCountItem } from "src/domain/count.js";
import { postAlertToGroup } from "src/bot/handlers/alert.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import * as routineRepo from "src/persistence/repositories/routineRepo.js";

const COUNT_ROUTINE_NAME = "Contagem de Carne";

/**
 * D1: only proceeds to calculation/comparison after the collaborator confirms the
 * parse (handlers/count.ts stored the pending parse and showed the summary with buttons).
 */
export function registerConfirmationHandler(bot: Telegraf<Context>, db: Db): void {
  bot.action(/^confirm:(.+)$/, async (ctx) => {
    const id = (ctx.match as RegExpMatchArray)[1];
    await ctx.answerCbQuery();
    if (!id) return;

    const pendingCount = consumePending(id);
    if (!pendingCount) {
      await ctx.reply("Essa confirmação expirou ou já foi processada. Envie a contagem novamente.");
      return;
    }

    const activeStore = await storeRepo.findActiveStore(db);
    if (!activeStore) {
      await ctx.reply("Nenhuma loja ativa configurada — não é possível registrar a contagem.");
      return;
    }

    const routine = await routineRepo.findActiveByName(db, activeStore.id, COUNT_ROUTINE_NAME);
    if (!routine) {
      await ctx.reply(`Rotina "${COUNT_ROUTINE_NAME}" não está configurada para esta loja.`);
      return;
    }

    const notFound: string[] = [];
    const invalidQuantities: string[] = [];
    const matched: string[] = [];
    const notMatched: string[] = [];

    for (const item of pendingCount.parse.items) {
      const result = await processCountItem(db, {
        storeId: activeStore.id,
        routineId: routine.id,
        collaboratorTelegramId: pendingCount.collaboratorTelegramId,
        rawText: pendingCount.rawText,
        llmUsed: pendingCount.llmUsed,
        item,
      });

      if (!result.found) {
        notFound.push(result.supplyTextOriginal);
        continue;
      }

      const displayName = result.supplyName ?? result.supplyTextOriginal;

      if (result.invalidQuantity) {
        invalidQuantities.push(displayName);
        continue;
      }

      if (result.matched) {
        matched.push(displayName);
      } else {
        notMatched.push(displayName);
        if (result.countId) {
          await postAlertToGroup(bot, db, { countId: result.countId, supplyName: displayName });
        }
      }
    }

    // Blind count: the reply to the collaborator never mentions the expected value.
    const replyParts: string[] = [];
    if (matched.length > 0) {
      replyParts.push(`✅ Tudo certo: ${matched.join(", ")}.`);
    }
    if (notMatched.length > 0) {
      replyParts.push(`🚨 Alerta enviado ao grupo para: ${notMatched.join(", ")}.`);
    }
    if (invalidQuantities.length > 0) {
      replyParts.push(`⚠️ Quantidade precisa ser um número inteiro para: ${invalidQuantities.join(", ")}.`);
    }
    if (notFound.length > 0) {
      replyParts.push(`⚠️ Insumo não encontrado no cadastro: ${notFound.join(", ")}.`);
    }

    await ctx.reply(replyParts.join("\n") || "Nada para registrar.");
  });

  bot.action(/^correct:(.+)$/, async (ctx) => {
    const id = (ctx.match as RegExpMatchArray)[1];
    await ctx.answerCbQuery();
    if (id) {
      consumePending(id);
    }
    await ctx.reply("Sem problemas — pode reenviar a contagem corrigida.");
  });
}
