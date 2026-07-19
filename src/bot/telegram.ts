import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import { createAuthorizationMiddleware } from "src/bot/middleware/authorization.js";

export function createBot(botToken: string, authorizedIds: string[]): Telegraf<Context> {
  const bot = new Telegraf<Context>(botToken);
  bot.use(createAuthorizationMiddleware(authorizedIds));
  return bot;
}
