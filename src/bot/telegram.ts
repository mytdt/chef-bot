import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import { criarMiddlewareAutorizacao } from "src/bot/middleware/autorizacao.js";

export function criarBot(botToken: string, idsAutorizados: string[]): Telegraf<Context> {
  const bot = new Telegraf<Context>(botToken);
  bot.use(criarMiddlewareAutorizacao(idsAutorizados));
  return bot;
}
