import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistencia/db.js";
import * as lojaRepo from "src/persistencia/repositories/lojaRepo.js";
import { criarAlerta, reconhecerAlerta } from "src/dominio/alerta.js";

/**
 * Posta o alerta no grupo da Loja (telegram_group_id lido do banco, D4/decisão confirmada),
 * não na conversa onde a contagem foi confirmada — o alerta deve sempre chegar ao grupo
 * inteiro, independente de onde o colaborador enviou a contagem.
 */
export async function postarAlertaNoGrupo(
  bot: Telegraf<Context>,
  db: Db,
  params: { contagemId: string; insumoNome: string },
): Promise<void> {
  const lojaAtiva = await lojaRepo.buscarLojaAtiva(db);
  if (!lojaAtiva) {
    throw new Error("Nenhuma loja ativa encontrada — não foi possível postar o alerta no grupo.");
  }

  const alertaCriado = await criarAlerta(db, params.contagemId);

  await bot.telegram.sendMessage(
    lojaAtiva.telegramGroupId,
    `⚠️ @all Contagem de "${params.insumoNome}" não bateu. Confiram e reconheçam este alerta.`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "✅ Reconheço", callback_data: `reconhecer:${alertaCriado.id}` }]],
      },
    },
  );
}

export function registrarHandlerAlerta(bot: Telegraf<Context>, db: Db): void {
  bot.action(/^reconhecer:(.+)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const alertaId = match[1];
    if (!alertaId) {
      await ctx.answerCbQuery();
      return;
    }

    const reconhecidoPor = ctx.from?.id?.toString() ?? "desconhecido";
    await reconhecerAlerta(db, alertaId, reconhecidoPor);

    await ctx.answerCbQuery("Reconhecido!");
    await ctx.editMessageText(`${(ctx.callbackQuery.message as { text?: string } | undefined)?.text ?? ""}\n\n✅ Reconhecido por ${reconhecidoPor}.`);
  });
}
