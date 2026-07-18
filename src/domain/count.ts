import type { Db } from "src/persistence/db.js";
import type { CountItem } from "src/bot/parse.schema.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { calculateExpectedValue } from "src/calculation/expected.js";
import { decideMatch } from "src/calculation/comparison.js";
import { isValidQuantity } from "src/domain/quantityRules.js";

export interface ProcessCountItemResult {
  supplyTextOriginal: string;
  found: boolean;
  invalidQuantity?: boolean;
  supplyId?: string;
  supplyName?: string;
  countId?: string;
  matched?: boolean;
}

/**
 * Orchestrates the creation of a Count for an item already confirmed by the
 * collaborator (D1): resolves the Supply, looks up the previous count + movements
 * since then, calculates the expected value, decides match/no-match and persists a
 * new immutable record.
 */
export async function processCountItem(
  db: Db,
  params: {
    storeId: string;
    routineId: string;
    collaboratorTelegramId: string;
    rawText: string;
    item: CountItem;
  },
): Promise<ProcessCountItemResult> {
  const { storeId, routineId, collaboratorTelegramId, rawText, item } = params;

  const supplyFound = await supplyRepo.findByName(db, storeId, item.supply);
  if (!supplyFound) {
    return { supplyTextOriginal: item.supply, found: false };
  }

  const quantityInvalid =
    !isValidQuantity(supplyFound.category, item.quantity) ||
    (item.actualQuantity !== null && !isValidQuantity(supplyFound.category, item.actualQuantity));

  if (quantityInvalid) {
    return {
      supplyTextOriginal: item.supply,
      found: true,
      invalidQuantity: true,
      supplyId: supplyFound.id,
      supplyName: supplyFound.name,
    };
  }

  const previousCount = await countRepo.findLastConfirmedBySupply(db, supplyFound.id);
  const since = previousCount?.createdAt ?? new Date(0);
  const movements = await inventoryMovementRepo.sumSince(db, supplyFound.id, since);

  const expectedValue = calculateExpectedValue(
    previousCount
      ? {
          reportedValue: previousCount.reportedValue,
          actualQuantityReported: previousCount.actualQuantityReported,
        }
      : null,
    movements,
  );

  const matched = decideMatch(
    { reportedValue: item.quantity, actualQuantityReported: item.actualQuantity },
    expectedValue,
  );

  const countCreated = await countRepo.insert(db, {
    routineId,
    supplyId: supplyFound.id,
    collaboratorTelegramId,
    rawText,
    reportedValue: item.quantity,
    actualQuantityReported: item.actualQuantity,
    expectedValue,
    matched,
    confirmedByCollaborator: true,
  });

  return {
    supplyTextOriginal: item.supply,
    found: true,
    supplyId: supplyFound.id,
    supplyName: supplyFound.name,
    countId: countCreated.id,
    matched,
  };
}
