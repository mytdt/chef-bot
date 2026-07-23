import type { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import type { LLMParser } from "src/llm/llmParser.js";
import { parseCountText } from "src/bot/parse.js";
import { storePending } from "src/bot/pendingCounts.js";

export interface CountHandlerDeps {
  llmParser: LLMParser;
}

function formatSummary(items: { supply: string; quantity: number; actualQuantity: number | null }[]): string {
  return items
    .map((item) => {
      const actual = item.actualQuantity !== null ? ` (real informada: ${item.actualQuantity})` : "";
      return `• ${item.supply}: ${item.quantity}${actual}`;
    })
    .join("\n");
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
        "Não consegui interpretar essa contagem. Pode reenviar no formato usual (ex.: 742 G / 689 F / 380 W)?",
      );
      return;
    }

    const id = storePending({
      chatId: ctx.chat.id,
      collaboratorTelegramId,
      rawText: text,
      parse: parseResult.parse,
      llmUsed: parseResult.llmUsed,
    });

    await ctx.reply(`Entendi:\n${formatSummary(parseResult.parse.items)}\n\nConfirma?`, {
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
