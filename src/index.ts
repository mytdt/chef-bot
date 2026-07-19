import { loadEnv } from "src/config/env.js";
import { createDb } from "src/persistence/db.js";
import { createClaudeClient } from "src/llm/claudeClient.js";
import { createBot } from "src/bot/telegram.js";
import { registerMovementHandler } from "src/bot/handlers/movement.js";
import { registerAlertHandler } from "src/bot/handlers/alert.js";
import { registerConfirmationHandler } from "src/bot/handlers/confirmation.js";
import { registerCountHandler } from "src/bot/handlers/count.js";
import { startEscalation } from "src/alerts/escalation.js";

async function main() {
  const env = loadEnv();
  const db = createDb({ DATABASE_URL: env.DATABASE_URL });
  const claudeClient = createClaudeClient(env.ANTHROPIC_API_KEY);
  const bot = createBot(env.BOT_TOKEN, env.AUTHORIZED_TELEGRAM_IDS);

  // Specific commands and callbacks before the free-text handler (catch-all), which
  // also guards itself against command messages as a safety net.
  registerMovementHandler(bot, db);
  registerAlertHandler(bot, db);
  registerConfirmationHandler(bot, db);
  registerCountHandler(bot, { claudeClient });

  const escalationTimer = startEscalation(bot, db, {
    timeoutMinutes: env.ALERT_TIMEOUT_MINUTES,
    escalationContactTelegramId: env.ESCALATION_CONTACT_TELEGRAM_ID,
  });

  const stop = (signal: string) => {
    clearInterval(escalationTimer);
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
