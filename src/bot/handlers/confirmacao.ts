import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistencia/db.js";
import { consumirPendente } from "src/bot/pendentes.js";
import { processarItemContagem } from "src/dominio/contagem.js";
import { postarAlertaNoGrupo } from "src/bot/handlers/alerta.js";
import * as lojaRepo from "src/persistencia/repositories/lojaRepo.js";
import * as rotinaRepo from "src/persistencia/repositories/rotinaRepo.js";

const NOME_ROTINA_CONTAGEM_CARNE = "Contagem de Carne";

/**
 * D1: só entra em cálculo/comparação depois do colaborador confirmar o parse
 * (handlers/contagem.ts armazenou o parse pendente e mostrou o resumo com botões).
 */
export function registrarHandlerConfirmacao(bot: Telegraf<Context>, db: Db): void {
  bot.action(/^confirmar:(.+)$/, async (ctx) => {
    const id = (ctx.match as RegExpMatchArray)[1];
    await ctx.answerCbQuery();
    if (!id) return;

    const pendente = consumirPendente(id);
    if (!pendente) {
      await ctx.reply("Essa confirmação expirou ou já foi processada. Envie a contagem novamente.");
      return;
    }

    const lojaAtiva = await lojaRepo.buscarLojaAtiva(db);
    if (!lojaAtiva) {
      await ctx.reply("Nenhuma loja ativa configurada — não é possível registrar a contagem.");
      return;
    }

    const rotina = await rotinaRepo.buscarAtivaPorNome(db, lojaAtiva.id, NOME_ROTINA_CONTAGEM_CARNE);
    if (!rotina) {
      await ctx.reply(`Rotina "${NOME_ROTINA_CONTAGEM_CARNE}" não está configurada para esta loja.`);
      return;
    }

    const naoEncontrados: string[] = [];
    const bateram: string[] = [];
    const naoBateram: string[] = [];

    for (const item of pendente.parse.itens) {
      const resultado = await processarItemContagem(db, {
        lojaId: lojaAtiva.id,
        rotinaId: rotina.id,
        colaboradorTelegramId: pendente.colaboradorTelegramId,
        textoBruto: pendente.textoBruto,
        item,
      });

      if (!resultado.encontrado) {
        naoEncontrados.push(resultado.insumoTextoOriginal);
        continue;
      }

      const nomeExibicao = resultado.insumoNome ?? resultado.insumoTextoOriginal;
      if (resultado.bateu) {
        bateram.push(nomeExibicao);
      } else {
        naoBateram.push(nomeExibicao);
        if (resultado.contagemId) {
          await postarAlertaNoGrupo(bot, db, { contagemId: resultado.contagemId, insumoNome: nomeExibicao });
        }
      }
    }

    // Contagem às cegas: a resposta ao colaborador nunca menciona o valor esperado.
    const partesResposta: string[] = [];
    if (bateram.length > 0) {
      partesResposta.push(`✅ Tudo certo: ${bateram.join(", ")}.`);
    }
    if (naoBateram.length > 0) {
      partesResposta.push(`🚨 Alerta enviado ao grupo para: ${naoBateram.join(", ")}.`);
    }
    if (naoEncontrados.length > 0) {
      partesResposta.push(`⚠️ Insumo não encontrado no cadastro: ${naoEncontrados.join(", ")}.`);
    }

    await ctx.reply(partesResposta.join("\n") || "Nada para registrar.");
  });

  bot.action(/^corrigir:(.+)$/, async (ctx) => {
    const id = (ctx.match as RegExpMatchArray)[1];
    await ctx.answerCbQuery();
    if (id) {
      consumirPendente(id);
    }
    await ctx.reply("Sem problemas — pode reenviar a contagem corrigida.");
  });
}
