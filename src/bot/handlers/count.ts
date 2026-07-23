import type { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import type { LLMParser } from "src/llm/llmParser.js";
import { parseCountText } from "src/bot/parse.js";
import { storePending } from "src/bot/pendingCounts.js";
import { aggregateParsedCount } from "src/domain/aggregateParsedCount.js";
import { formatCountConfirmationSummary } from "src/bot/formatCountConfirmation.js";

export interface CountHandlerDeps {
  llmParser: LLMParser;
}

/**
 * D1: every count parsed via the LLM is summarized and waits for the collaborator's
 * explicit confirmation before any calculation or comparison (see handlers/confirmation.ts).
 */
export function registerCountHandler(bot: Telegraf<Context>, deps: CountHandlerDeps): void {
  bot.on(message("text"), async (ctx, next) => {
    const text = ctx.message.text;
    // Skip commands so they can reach bot.command handlers registered later in
    // the chain. Returning without next() used to swallow every "/..." message
    // (including /ingest_xml) — see registerHandlers.ts.
    if (text.startsWith("/")) {
      return next();
    }

    const collaboratorTelegramId = ctx.from.id.toString();

    let parseResult;
    try {
      parseResult = await parseCountText(deps.llmParser, text);
    } catch (error) {
      console.error("Failed to parse count via LLM:", error);
      await ctx.reply(
        "Não consegui interpretar essa contagem. Pode reenviar no formato usual (Mezanino + Cozinha, ex.: 857 G / …)?",
      );
      return;
    }

    const aggregation = aggregateParsedCount(parseResult.parse);
    if (aggregation.items.length === 0) {
      await ctx.reply(
        "Entendi a mensagem, mas nenhum item ficou utilizável após a conversão (PCT sem fator ou insumo desconhecido). Pode reenviar?",
      );
      return;
    }

    const id = storePending({
      chatId: ctx.chat.id,
      collaboratorTelegramId,
      rawText: text,
      date: parseResult.parse.date,
      items: aggregation.items,
      llmUsed: parseResult.llmUsed,
    });

    await ctx.reply(formatCountConfirmationSummary(parseResult.parse.date, aggregation), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmar", callback_data: `confirm:${id}` },
            { text: "✏️ Corrigir", callback_data: `correct:${id}` },
          ],
        ],
      },
    });
  });
}
