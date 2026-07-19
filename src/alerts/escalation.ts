import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import * as alertRepo from "src/persistence/repositories/alertRepo.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";

export interface AlertPendingEscalation {
  id: string;
  sentAt: Date;
  acknowledged: boolean;
  escalated: boolean;
}

/**
 * D2: an unacknowledged alert escalates via DM after N minutes. The decision is
 * derived entirely from sentAt (persisted) + now, so it survives a process restart —
 * no timer state lives only in memory.
 */
export function shouldEscalate<T extends AlertPendingEscalation>(alert: T, now: Date, timeoutMinutes: number): boolean {
  if (alert.acknowledged || alert.escalated) {
    return false;
  }
  const limitMs = timeoutMinutes * 60 * 1000;
  return now.getTime() - alert.sentAt.getTime() >= limitMs;
}

export function filterAlertsToEscalate<T extends AlertPendingEscalation>(
  alerts: T[],
  now: Date,
  timeoutMinutes: number,
): T[] {
  return alerts.filter((alert) => shouldEscalate(alert, now, timeoutMinutes));
}

/**
 * I/O wrapper around the pure decision above: polls the database every
 * `intervalMs` (60s by default) instead of scheduling a timer per alert, because
 * "when to escalate" is derived only from `sentAt` — it survives a process restart,
 * unlike an individual setTimeout per alert.
 */
export function startEscalation(
  bot: Telegraf<Context>,
  db: Db,
  params: { timeoutMinutes: number; escalationContactTelegramId: string; intervalMs?: number },
): NodeJS.Timeout {
  const intervalMs = params.intervalMs ?? 60_000;

  const check = async () => {
    try {
      const pending = await alertRepo.listPendingEscalation(db);
      const toEscalate = filterAlertsToEscalate(pending, new Date(), params.timeoutMinutes);

      for (const pendingAlert of toEscalate) {
        const relatedCount = await countRepo.findById(db, pendingAlert.countId);
        const relatedSupply = relatedCount ? await supplyRepo.findById(db, relatedCount.supplyId) : null;

        await bot.telegram.sendMessage(
          params.escalationContactTelegramId,
          `🚨 O alerta de contagem${relatedSupply ? ` de "${relatedSupply.name}"` : ""} não foi reconhecido em ${params.timeoutMinutes} min. Confira o grupo.`,
        );

        await alertRepo.markEscalated(db, pendingAlert.id, params.escalationContactTelegramId);
      }
    } catch (error) {
      console.error("Failed to check alert escalation:", error);
    }
  };

  // Immediate check on boot ensures alerts pending from before a restart don't
  // "lose track of time" — state is derived entirely from the persisted sentAt.
  void check();
  return setInterval(check, intervalMs);
}
