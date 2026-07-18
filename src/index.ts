import { carregarEnv } from "src/config/env.js";
import { criarDb } from "src/persistencia/db.js";
import { criarClaudeClient } from "src/llm/claudeClient.js";
import { criarBot } from "src/bot/telegram.js";
import { registrarHandlerMovimento } from "src/bot/handlers/movimento.js";
import { registrarHandlerAlerta } from "src/bot/handlers/alerta.js";
import { registrarHandlerConfirmacao } from "src/bot/handlers/confirmacao.js";
import { registrarHandlerContagem } from "src/bot/handlers/contagem.js";
import { iniciarEscalonamento } from "src/alertas/escalonamento.js";

async function main() {
  const env = carregarEnv();
  const db = criarDb({ DATABASE_URL: env.DATABASE_URL });
  const claudeClient = criarClaudeClient(env.ANTHROPIC_API_KEY);
  const bot = criarBot(env.BOT_TOKEN, env.AUTHORIZED_TELEGRAM_IDS);

  // Comandos e callbacks específicos antes do handler de texto livre (catch-all),
  // que já se protege contra mensagens de comando por garantia própria.
  registrarHandlerMovimento(bot, db);
  registrarHandlerAlerta(bot, db);
  registrarHandlerConfirmacao(bot, db);
  registrarHandlerContagem(bot, { claudeClient });

  const escalonamentoTimer = iniciarEscalonamento(bot, db, {
    timeoutMinutos: env.ALERT_TIMEOUT_MINUTES,
    responsavelTelegramId: env.RESPONSAVEL_ESCALONAMENTO_TELEGRAM_ID,
  });

  const parar = (sinal: string) => {
    clearInterval(escalonamentoTimer);
    bot.stop(sinal);
  };
  process.once("SIGINT", () => parar("SIGINT"));
  process.once("SIGTERM", () => parar("SIGTERM"));

  await bot.launch();
  console.log("Bot iniciado.");
}

main().catch((error) => {
  console.error("Falha ao iniciar o bot:", error);
  process.exit(1);
});
