import type { Context, MiddlewareFn } from "telegraf";
import { errorContext, log } from "src/logging/logger.js";

/**
 * Wraps a command handler so every run emits start/done (or failed) with durationMs.
 * Place after auth middlewares so rejected admins don't count as handler work.
 */
export function withCommandLogging(
  command: string,
  handler: (ctx: Context) => Promise<void>,
): MiddlewareFn<Context> {
  return async (ctx) => {
    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id?.toString();
    const started = Date.now();
    log.info(command, "handler start", { chatId, userId });
    try {
      await handler(ctx);
      log.info(command, "handler done", { chatId, userId, durationMs: Date.now() - started });
    } catch (error) {
      log.error(command, "handler failed", {
        chatId,
        userId,
        durationMs: Date.now() - started,
        ...errorContext(error),
      });
      throw error;
    }
  };
}
