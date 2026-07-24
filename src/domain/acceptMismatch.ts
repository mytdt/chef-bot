import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as routineCheckRepo from "src/persistence/repositories/routineCheckRepo.js";
import { effectiveValue } from "src/calculation/expected.js";

export type AcceptMismatchResult =
  | {
      ok: true;
      supplyCode: string;
      supplyName: string;
      reportedValue: number;
      expectedValue: number;
      difference: number;
    }
  | { ok: false; reason: "supply_not_found" | "nothing_to_accept" | "already_accepted"; supplyToken: string };

/**
 * /aceitar <code|name>: accept the latest confirmed mismatched count for that supply
 * that has not been accepted yet. Write-once on routine_check.
 */
export async function acceptLatestMismatch(
  db: Db,
  params: { storeId: string; supplyToken: string; acceptedByTelegramId: string },
): Promise<AcceptMismatchResult> {
  const token = params.supplyToken.trim();
  const supplyFound =
    (await supplyRepo.findByCode(db, params.storeId, token)) ??
    (await supplyRepo.findByName(db, params.storeId, token));

  if (!supplyFound) {
    return { ok: false, reason: "supply_not_found", supplyToken: token };
  }

  const pendingCheck = await routineCheckRepo.findLatestUnacceptedMismatchBySupply(
    db,
    params.storeId,
    supplyFound.id,
  );
  if (!pendingCheck) {
    // Write-once: repeating /aceitar after the latest check was accepted → "já aceito".
    // No mismatch ever (or only matched counts) → "nada para aceitar".
    const latest = await routineCheckRepo.findLatestBySupply(db, params.storeId, supplyFound.id);
    if (latest?.acceptedAt) {
      return { ok: false, reason: "already_accepted", supplyToken: supplyFound.code };
    }
    return { ok: false, reason: "nothing_to_accept", supplyToken: supplyFound.code };
  }

  const countRow = await countRepo.findByRoutineCheckId(db, pendingCheck.id);
  if (!countRow) {
    return { ok: false, reason: "nothing_to_accept", supplyToken: supplyFound.code };
  }

  const updated = await routineCheckRepo.acceptIfPending(db, pendingCheck.id, params.acceptedByTelegramId);
  if (!updated) {
    return { ok: false, reason: "already_accepted", supplyToken: supplyFound.code };
  }

  const reportedValue = effectiveValue({
    reportedValue: countRow.reportedValue,
    actualQuantityReported: countRow.actualQuantityReported,
  });

  return {
    ok: true,
    supplyCode: supplyFound.code,
    supplyName: supplyFound.name,
    reportedValue,
    expectedValue: countRow.expectedValue,
    difference: reportedValue - countRow.expectedValue,
  };
}

export function formatAcceptReply(result: AcceptMismatchResult): string {
  if (!result.ok) {
    if (result.reason === "supply_not_found") {
      return `Insumo "${result.supplyToken}" não encontrado no cadastro.`;
    }
    if (result.reason === "already_accepted") {
      return `A divergência de ${result.supplyToken} já foi aceita.`;
    }
    return `Nada para aceitar em ${result.supplyToken}.`;
  }

  const diff =
    result.difference > 0 ? `+${result.difference}` : String(result.difference);
  return (
    `✅ Divergência de ${result.supplyName} (${result.supplyCode}) aceita como estoque real.\n` +
    `informado: ${result.reportedValue} | esperado: ${result.expectedValue} | diferença: ${diff}`
  );
}
