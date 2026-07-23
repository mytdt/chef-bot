import { loadEnv } from "src/config/env.js";
import { createDb } from "src/persistence/db.js";
import { createClaudeParser } from "src/llm/claudeClient.js";
import { createGeminiClient, createGeminiParser } from "src/llm/geminiClient.js";
import { createFallbackParser } from "src/llm/fallbackParser.js";
import type { LLMParser } from "src/llm/llmParser.js";
import { createBot } from "src/bot/telegram.js";
import { registerMovementHandler } from "src/bot/handlers/movement.js";
import { registerConfirmationHandler } from "src/bot/handlers/confirmation.js";
import { registerCountHandler } from "src/bot/handlers/count.js";
import { registerIngestXmlCommand } from "src/bot/handlers/ingestXml.js";
import { registerPingCommand } from "src/bot/handlers/ping.js";
import { registerLlmCheckCommand } from "src/bot/handlers/llmCheck.js";
import { createDriveFilesAndContentApi } from "src/salesXml/googleDriveClient.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";

async function main() {
  const env = loadEnv();
  const db = createDb({ DATABASE_URL: env.DATABASE_URL });

  // C5/D10: Gemini fallback only wired in when GEMINI_API_KEY is set — without it, the
  // bot still runs on Claude alone, same as before this feature existed.
  const claudeParser = createClaudeParser(env.ANTHROPIC_API_KEY);
  const llmParser: LLMParser = env.GEMINI_API_KEY
    ? createFallbackParser(claudeParser, createGeminiParser(createGeminiClient(env.GEMINI_API_KEY)))
    : claudeParser;

  const driveFiles = createDriveFilesAndContentApi(env.GOOGLE_SERVICE_ACCOUNT_KEY);

  // D9: authorization is by Telegram group (store.telegramGroupId), not an individual
  // allowlist — the active store must be known before the bot (and its middleware) exist.
  const activeStore = await storeRepo.findActiveStore(db);
  if (!activeStore) {
    throw new Error("No active store found — run the seed before starting the bot.");
  }
  const bot = createBot(env.BOT_TOKEN, activeStore.telegramGroupId);

  // Specific commands and callbacks before the free-text handler (catch-all), which
  // also guards itself against command messages as a safety net.
  registerPingCommand(bot);
  registerLlmCheckCommand(bot, { adminTelegramIds: env.ADMIN_TELEGRAM_IDS, llmParser });
  registerMovementHandler(bot, db);
  registerConfirmationHandler(bot, db);
  registerCountHandler(bot, { llmParser });
  registerIngestXmlCommand(bot, db, {
    adminTelegramIds: env.ADMIN_TELEGRAM_IDS,
    driveFiles,
    rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  });

  const stop = (signal: string) => {
    bot.stop(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  await bot.launch();
  console.log("Bot started.");
}

main().catch((error) => {
  console.error("Failed to start the bot:", error);
  process.exit(1);
});
