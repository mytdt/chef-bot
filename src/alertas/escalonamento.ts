import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistencia/db.js";
import * as alertaRepo from "src/persistencia/repositories/alertaRepo.js";
import * as contagemRepo from "src/persistencia/repositories/contagemRepo.js";
import * as insumoRepo from "src/persistencia/repositories/insumoRepo.js";

export interface AlertaParaEscalonamento {
  id: string;
  enviadoEm: Date;
  reconhecido: boolean;
  escalonado: boolean;
}

/**
 * D2: alerta não reconhecido escala via DM após N minutos. A decisão é derivada
 * inteiramente de enviadoEm (persistido) + agora, para sobreviver a restart do processo —
 * nenhum estado de timer vive só em memória.
 */
export function deveEscalar<T extends AlertaParaEscalonamento>(alerta: T, agora: Date, timeoutMinutos: number): boolean {
  if (alerta.reconhecido || alerta.escalonado) {
    return false;
  }
  const limiteMs = timeoutMinutos * 60 * 1000;
  return agora.getTime() - alerta.enviadoEm.getTime() >= limiteMs;
}

export function filtrarAlertasParaEscalar<T extends AlertaParaEscalonamento>(
  alertas: T[],
  agora: Date,
  timeoutMinutos: number,
): T[] {
  return alertas.filter((alerta) => deveEscalar(alerta, agora, timeoutMinutos));
}

/**
 * Wrapper de I/O em torno da decisão pura acima: faz polling do banco a cada
 * `intervaloMs` (60s por padrão) em vez de agendar um timer por alerta, porque o
 * estado de "quando escalar" é derivado só de `enviadoEm` — sobrevive a um restart
 * do processo, ao contrário de um setTimeout individual por alerta.
 */
export function iniciarEscalonamento(
  bot: Telegraf<Context>,
  db: Db,
  params: { timeoutMinutos: number; responsavelTelegramId: string; intervaloMs?: number },
): NodeJS.Timeout {
  const intervaloMs = params.intervaloMs ?? 60_000;

  const checar = async () => {
    try {
      const pendentes = await alertaRepo.listarPendentesDeEscalonamento(db);
      const paraEscalar = filtrarAlertasParaEscalar(pendentes, new Date(), params.timeoutMinutos);

      for (const alertaPendente of paraEscalar) {
        const contagemRelacionada = await contagemRepo.buscarPorId(db, alertaPendente.contagemId);
        const insumoRelacionado = contagemRelacionada
          ? await insumoRepo.buscarPorId(db, contagemRelacionada.insumoId)
          : null;

        await bot.telegram.sendMessage(
          params.responsavelTelegramId,
          `🚨 Alerta de contagem${insumoRelacionado ? ` de "${insumoRelacionado.nome}"` : ""} não foi reconhecido em ${params.timeoutMinutos} min. Verifique o grupo.`,
        );

        await alertaRepo.marcarEscalonado(db, alertaPendente.id, params.responsavelTelegramId);
      }
    } catch (error) {
      console.error("Falha ao checar escalonamento de alertas:", error);
    }
  };

  // Checagem imediata no boot garante que alertas pendentes de antes de um restart
  // não "somem do relógio" — o estado é 100% derivado de enviadoEm, persistido.
  void checar();
  return setInterval(checar, intervaloMs);
}
