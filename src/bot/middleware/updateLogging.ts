import type { Context, MiddlewareFn } from "telegraf";
import { log } from "src/logging/logger.js";

export type UpdateKind = "command" | "text" | "callback_query" | "other";

export function describeUpdate(ctx: Context): {
  chatId: string | undefined;
  updateKind: UpdateKind;
  command?: string;
  textPreview?: string;
} {
  const chatId = ctx.chat?.id?.toString();

  if (ctx.callbackQuery) {
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    return {
      chatId,
      updateKind: "callback_query",
      textPreview: data?.slice(0, 80),
    };
  }

  const message = ctx.message;
  if (message && "text" in message && typeof message.text === "string") {
    const text = message.text;
    const commandEntity = message.entities?.find((entity) => entity.type === "bot_command" && entity.offset === 0);
    if (commandEntity) {
      const raw = text.slice(commandEntity.offset, commandEntity.offset + commandEntity.length);
      const command = raw.split("@")[0] ?? raw;
      return {
        chatId,
        updateKind: "command",
        command,
        textPreview: text.slice(0, 80),
      };
    }
    return {
      chatId,
      updateKind: "text",
      textPreview: text.slice(0, 80),
    };
  }

  return { chatId, updateKind: "other" };
}

/**
 * First middleware: log every update before authorization / handlers run.
 * `fromConfiguredGroup` alone would have caught the missing-minus group_id bug.
 */
export function createUpdateLoggingMiddleware(configuredGroupId: string): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const described = describeUpdate(ctx);
    log.info("update", "received", {
      chatId: described.chatId ?? null,
      updateKind: described.updateKind,
      command: described.command ?? null,
      textPreview: described.textPreview ?? null,
      fromConfiguredGroup: described.chatId !== undefined && described.chatId === configuredGroupId,
    });
    await next();
  };
}
