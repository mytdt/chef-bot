import type { Context, MiddlewareFn } from "telegraf";

/**
 * SPEC §6.4: the bot only processes messages from authorized collaborators. Messages
 * from anyone not on the allowlist are silently ignored (no reply), so unauthorized
 * users don't get confirmation that the bot is listening.
 */
export function createAuthorizationMiddleware(authorizedIds: string[]): MiddlewareFn<Context> {
  const authorized = new Set(authorizedIds);
  return async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId || !authorized.has(telegramId)) {
      return;
    }
    await next();
  };
}
