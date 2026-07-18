import type { Context, MiddlewareFn } from "telegraf";

/**
 * SPEC §6.4: bot só processa mensagens de colaboradores autorizados. Mensagens de
 * quem não está na allowlist são ignoradas silenciosamente (sem resposta), para não
 * confirmar a usuários não autorizados que o bot está escutando.
 */
export function criarMiddlewareAutorizacao(idsAutorizados: string[]): MiddlewareFn<Context> {
  const autorizados = new Set(idsAutorizados);
  return async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId || !autorizados.has(telegramId)) {
      return;
    }
    await next();
  };
}
