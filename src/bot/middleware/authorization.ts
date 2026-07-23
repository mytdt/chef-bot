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

/**
 * B3 bot integration: a narrower permission level within the already-authorized group
 * (D9) — everyone in the group can send counts, but only specific people can trigger
 * /ingest_xml. Unlike the silent drop above, this replies explicitly: the requester is
 * already in an authorized chat, so acknowledging the command exists (just not for
 * them) doesn't leak anything a group member couldn't already see.
 */
export function createAdminMiddleware(adminTelegramIds: string[]): MiddlewareFn<Context> {
  const adminSet = new Set(adminTelegramIds);
  return async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (!userId || !adminSet.has(userId)) {
      await ctx.reply("Esse comando é restrito a administradores.");
      return;
    }
    await next();
  };
}
