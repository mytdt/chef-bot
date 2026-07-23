import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import { createAlert } from "src/domain/alert.js";

/**
 * One mismatched supply in a confirmed count batch, ready for the group alert.
 * `difference` = informado − esperado (positive = counted more than the system;
 * negative = counted less). Chosen over esperado−informado so the sign matches
 * the collaborator's intuition ("+10" = sobrou na contagem).
 */
export interface CountMismatchAlertItem {
  countId: string;
  supplyName: string;
  reportedValue: number;
  expectedValue: number;
  difference: number;
}

function formatSignedDifference(difference: number): string {
  if (difference > 0) {
    return `+${difference}`;
  }
  return String(difference);
}

/**
 * Pure formatter for the consolidated group alert (one message for the whole batch).
 * Numbers are intentional: Emanoel revoked the original blind-count rule for this
 * group alert (see TRILHA-ENTREGAVEIS.md / D1 amendment). The immediate DM/reply to
 * the collaborator (formatCountBatchReply) still lists names only.
 */
export function formatConsolidatedAlertMessage(items: CountMismatchAlertItem[]): string {
  if (items.length === 0) {
    throw new Error("formatConsolidatedAlertMessage requires at least one mismatched item.");
  }

  const header =
    items.length === 1
      ? "⚠️ @all Contagem não bateu em 1 insumo:"
      : `⚠️ @all Contagem não bateu em ${items.length} insumos:`;

  const lines = items.map((item) => {
    const diff = formatSignedDifference(item.difference);
    return `• ${item.supplyName} — informado: ${item.reportedValue} | esperado: ${item.expectedValue} | diferença: ${diff}`;
  });

  const footer =
    "\n\nPor favor, recontagem e reenviem no formato usual (Mezanino + Cozinha)." +
    ' Se souberem o motivo da divergência, incluam uma linha "Motivo: ..." no reenvio.';

  return [header, ...lines].join("\n") + footer;
}

/**
 * Persists one Alert row per mismatched Count, then posts a single consolidated
 * message to the Store's telegram group (D4). C6: one-shot, no ack / escalation.
 */
export async function postConsolidatedAlertToGroup(
  bot: Telegraf<Context>,
  db: Db,
  items: CountMismatchAlertItem[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const activeStore = await storeRepo.findActiveStore(db);
  if (!activeStore) {
    throw new Error("No active store found — could not post the alert to the group.");
  }

  for (const item of items) {
    await createAlert(db, item.countId);
  }

  await bot.telegram.sendMessage(activeStore.telegramGroupId, formatConsolidatedAlertMessage(items));
}
