import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import { createAuthorizationMiddleware } from "src/bot/middleware/authorization.js";
import { createUpdateLoggingMiddleware, describeUpdate } from "src/bot/middleware/updateLogging.js";
import { errorContext, log } from "src/logging/logger.js";

export function createBot(botToken: string, groupId: string): Telegraf<Context> {
  const bot = new Telegraf<Context>(botToken);

  // Update log first — before D9 auth — so unauthorized / wrong-group traffic is visible.
  bot.use(createUpdateLoggingMiddleware(groupId));
  bot.use(createAuthorizationMiddleware(groupId));

  bot.catch((error, ctx) => {
    const described = describeUpdate(ctx);
    log.error("bot", "unhandled error in update handler", {
      chatId: described.chatId ?? null,
      updateKind: described.updateKind,
      command: described.command ?? null,
      textPreview: described.textPreview ?? null,
      ...errorContext(error),
    });
  });

  return bot;
}
