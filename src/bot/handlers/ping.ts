import type { Context, Telegraf } from "telegraf";

/**
 * Sanity-check layer 1 (before /llm_check and the full ingestion flow): confirms the
 * bot process is up and listening to this specific group. No admin gate — anyone
 * already inside the authorized group (D9, enforced by the bot-wide middleware in
 * telegram.ts) can run it, since it costs nothing and reveals nothing sensitive.
 */
export function registerPingCommand(bot: Telegraf<Context>): void {
  bot.command("ping", async (ctx) => {
    await ctx.reply("🏓 Pong! Bot ativo e ouvindo este grupo.");
  });
}
