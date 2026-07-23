import type { Context, Telegraf } from "telegraf";
import { createAdminMiddleware } from "src/bot/middleware/authorization.js";
import type { LLMParser } from "src/llm/llmParser.js";

// Trivial, fixed input — this command exists to check "does a model answer at all", not
// to validate parsing correctness (bot/parse.schema.test.ts and friends already cover
// that). Any valid free-text count works; "1 G" is just a stable, cheap choice.
const CHECK_TEXT = "1 G";

export interface LlmCheckHandlerDeps {
  adminTelegramIds: string[];
  llmParser: LLMParser;
}

/**
 * Command name uses an underscore, not a hyphen (2026-07-23 fix, was "/llm-check"):
 * Telegram bot commands only allow Latin letters, digits, and underscores
 * (https://core.telegram.org/bots/features#commands) — a hyphen isn't part of the
 * bot_command entity Telegram's client sends back, so this command silently never
 * matched (same root cause as the /ingest-xml -> /ingest_xml fix, see ingestXml.ts).
 *
 * Sanity-check layer 2 (after /ping, before the full ingestion flow): confirms the LLM
 * path actually answers, going through the exact same LLMParser (Claude-primary,
 * Gemini-fallback — C5/D10/fallbackParser.ts) the real count flow uses, not a separate
 * client — a pass here means bot/handlers/count.ts's parsing step is live.
 *
 * Admin-gated, same as /ingest_xml: this calls a real paid API on every run, so it
 * shouldn't be triggerable by anyone in the group on a whim.
 */
export function registerLlmCheckCommand(bot: Telegraf<Context>, deps: LlmCheckHandlerDeps): void {
  bot.command("llm_check", createAdminMiddleware(deps.adminTelegramIds), async (ctx) => {
    try {
      const result = await deps.llmParser.parse(CHECK_TEXT);
      const providerLabel = result.provider === "gemini" ? "gemini (fallback)" : result.provider;
      await ctx.reply(`✅ Modelo respondeu: ${providerLabel}`);
    } catch (error) {
      console.error("llm_check failed:", error);
      await ctx.reply("❌ Nenhum modelo respondeu (Claude e Gemini indisponíveis). Veja os logs do bot para detalhes.");
    }
  });
}
