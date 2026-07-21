import type { Context, MiddlewareFn } from "telegraf";

/**
 * D9 (2026-07-21): the bot processes messages from anyone in the store's configured
 * Telegram group (`store.telegramGroupId`) — not an individually maintained allowlist.
 * Messages from any other chat (DMs, other groups) are silently ignored (no reply), so
 * unauthorized chats don't get confirmation that the bot is listening.
 */
export function createAuthorizationMiddleware(groupId: string): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId || chatId !== groupId) {
      return;
    }
    await next();
  };
}
