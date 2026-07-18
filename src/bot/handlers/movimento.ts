import type { Context, Telegraf } from "telegraf";
import { z } from "zod";
import type { Db } from "src/persistencia/db.js";
import * as insumoRepo from "src/persistencia/repositories/insumoRepo.js";
import * as historicoMovimentoRepo from "src/persistencia/repositories/historicoMovimentoRepo.js";
import * as lojaRepo from "src/persistencia/repositories/lojaRepo.js";
import type { TipoMovimento } from "src/dominio/tipos.js";

const argsSchema = z.object({
  quantidade: z.number().finite().positive(),
  insumoNome: z.string().min(1),
});

// Formato: /comando <nome do insumo> <quantidade> — último token é a quantidade,
// o restante (pode ter espaços) é o nome do insumo.
function parseArgs(textoComando: string): { quantidade: number; insumoNome: string } | null {
  const partes = textoComando.trim().split(/\s+/).slice(1);
  if (partes.length < 2) {
    return null;
  }

  const ultimo = partes[partes.length - 1];
  const resultado = argsSchema.safeParse({
    quantidade: Number(ultimo),
    insumoNome: partes.slice(0, -1).join(" "),
  });
  return resultado.success ? resultado.data : null;
}

function registrarComandoMovimento(bot: Telegraf<Context>, db: Db, comando: string, tipo: TipoMovimento): void {
  bot.command(comando, async (ctx) => {
    const args = parseArgs(ctx.message.text);
    if (!args) {
      await ctx.reply(`Formato inválido. Use: /${comando} <nome do insumo> <quantidade>`);
      return;
    }

    const lojaAtiva = await lojaRepo.buscarLojaAtiva(db);
    if (!lojaAtiva) {
      await ctx.reply("Nenhuma loja ativa configurada.");
      return;
    }

    const insumoEncontrado = await insumoRepo.buscarPorNome(db, lojaAtiva.id, args.insumoNome);
    if (!insumoEncontrado) {
      await ctx.reply(`Insumo "${args.insumoNome}" não encontrado no cadastro.`);
      return;
    }

    await historicoMovimentoRepo.inserir(db, {
      insumoId: insumoEncontrado.id,
      tipo,
      quantidade: args.quantidade,
      origem: "manual",
    });

    await ctx.reply(`Registrado: ${tipo} de ${args.quantidade} para "${insumoEncontrado.nome}".`);
  });
}

export function registrarHandlerMovimento(bot: Telegraf<Context>, db: Db): void {
  registrarComandoMovimento(bot, db, "recebimento", "recebimento");
  registrarComandoMovimento(bot, db, "venda", "venda");
  registrarComandoMovimento(bot, db, "desperdicio", "desperdicio");
}
