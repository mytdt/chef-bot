import { loadEnv } from "src/config/env.js";
import { createDb } from "src/persistence/db.js";
import { createClaudeParser } from "src/llm/claudeClient.js";
import { createGeminiClient, createGeminiParser } from "src/llm/geminiClient.js";
import { createFallbackParser } from "src/llm/fallbackParser.js";
import type { LLMParser } from "src/llm/llmParser.js";
import { createBot } from "src/bot/telegram.js";
import { registerHandlers } from "src/bot/registerHandlers.js";
import { createDriveFilesAndContentApi, warmDriveConnection } from "src/salesXml/googleDriveClient.js";
import { parseTelegramGroupId } from "src/domain/telegramGroupId.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import { errorContext, log } from "src/logging/logger.js";
import { sql } from "drizzle-orm";

async function main() {
  const env = loadEnv();
  log.info("startup", "env loaded");

  const db = createDb({ DATABASE_URL: env.DATABASE_URL });
  await db.execute(sql`select 1`);
  log.info("startup", "DB connected");

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
  // Fail loud at boot if the DB still has a positive/malformed group id — otherwise
  // D9 auth silently drops every update (exact string compare, no error reply).
  const telegramGroupId = parseTelegramGroupId(activeStore.telegramGroupId);
  log.info("startup", "active store found", {
    storeName: activeStore.name,
    telegramGroupId,
  });

  const driveWarmStarted = Date.now();
  await warmDriveConnection(driveFiles, env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
  log.info("startup", "Drive warmed", { durationMs: Date.now() - driveWarmStarted });

  const bot = createBot(env.BOT_TOKEN, telegramGroupId);

  registerHandlers(bot, {
    db,
    llmParser,
    adminTelegramIds: env.ADMIN_TELEGRAM_IDS,
    ingestXml: {
      adminTelegramIds: env.ADMIN_TELEGRAM_IDS,
      driveFiles,
      rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    },
  });

  const stop = (signal: string) => {
    log.info("startup", "stopping bot", { signal });
    bot.stop(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  await bot.launch();
  log.info("startup", "Bot started");
}

main().catch((error) => {
  log.error("startup", "Failed to start the bot", errorContext(error));
  process.exit(1);
});
