import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import { acceptLatestMismatch, formatAcceptReply } from "src/domain/acceptMismatch.js";
import { withCommandLogging } from "src/logging/withCommandLogging.js";

/**
 * /aceitar <código|nome> — any group member (D9, same as /ping) may accept the latest
 * unmatched count for that supply as the new stock baseline. No admin gate.
 */
export function registerAcceptCommand(bot: Telegraf<Context>, db: Db): void {
  bot.command(
    "aceitar",
    withCommandLogging("aceitar", async (ctx) => {
      if (!ctx.message || !("text" in ctx.message)) {
        return;
      }

      const parts = ctx.message.text.trim().split(/\s+/).slice(1);
      const supplyToken = parts.join(" ").trim();
      if (!supplyToken) {
        await ctx.reply("Formato inválido. Use: /aceitar <código ou nome do insumo> (ex.: /aceitar F)");
        return;
      }

      const activeStore = await storeRepo.findActiveStore(db);
      if (!activeStore) {
        await ctx.reply("Nenhuma loja ativa configurada.");
        return;
      }

      const acceptedByTelegramId = ctx.from?.id?.toString();
      if (!acceptedByTelegramId) {
        await ctx.reply("Não consegui identificar quem está aceitando.");
        return;
      }

      const result = await acceptLatestMismatch(db, {
        storeId: activeStore.id,
        supplyToken,
        acceptedByTelegramId,
      });
      await ctx.reply(formatAcceptReply(result));
    }),
  );
}
