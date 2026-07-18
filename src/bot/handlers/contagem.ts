import type { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import type Anthropic from "@anthropic-ai/sdk";
import { parseContagemTexto } from "src/bot/parse.js";
import { armazenarPendente } from "src/bot/pendentes.js";

export interface DepsHandlerContagem {
  claudeClient: Anthropic;
}

function formatarResumo(itens: { insumo: string; quantidade: number; quantidadeReal: number | null }[]): string {
  return itens
    .map((item) => {
      const real = item.quantidadeReal !== null ? ` (real informada: ${item.quantidadeReal})` : "";
      return `• ${item.insumo}: ${item.quantidade}${real}`;
    })
    .join("\n");
}

/**
 * D1: toda contagem parseada via LLM é resumida e aguarda confirmação explícita do
 * colaborador antes de qualquer cálculo ou comparação (ver handlers/confirmacao.ts).
 */
export function registrarHandlerContagem(bot: Telegraf<Context>, deps: DepsHandlerContagem): void {
  bot.on(message("text"), async (ctx) => {
    const texto = ctx.message.text;
    if (texto.startsWith("/")) {
      return;
    }

    const colaboradorTelegramId = ctx.from.id.toString();

    let parse;
    try {
      parse = await parseContagemTexto(deps.claudeClient, texto);
    } catch (error) {
      console.error("Falha ao interpretar contagem via LLM:", error);
      await ctx.reply(
        "Não consegui interpretar essa contagem. Pode reenviar no formato usual (ex.: 742 G / 689 F / 380 W)?",
      );
      return;
    }

    const id = armazenarPendente({
      chatId: ctx.chat.id,
      colaboradorTelegramId,
      textoBruto: texto,
      parse,
    });

    await ctx.reply(`Entendi:\n${formatarResumo(parse.itens)}\n\nConfirma?`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmar", callback_data: `confirmar:${id}` },
            { text: "✏️ Corrigir", callback_data: `corrigir:${id}` },
          ],
        ],
      },
    });
  });
}
