import type { Db } from "src/persistence/db.js";
import type { AggregatedCountItem } from "src/bot/parse.schema.js";
import type { LlmProvider } from "src/domain/types.js";
import type { CountLocationBreakdown } from "src/persistence/schema.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as countRepo from "src/persistence/repositories/countRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { calculateExpectedValue, effectiveValue } from "src/calculation/expected.js";
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
  /** Effective reported value used in decideMatch (D5 override when present). */
  reportedValue?: number;
  expectedValue?: number;
}

/**
 * Orchestrates the creation of a Count for an item already confirmed by the
 * collaborator (D1): resolves the Supply, looks up the previous count + movements
 * since then, calculates the expected value, decides match/no-match and persists a
 * new immutable record. `item.quantity` is already the Mezanino+Cozinha aggregate in
 * units; `item.actualQuantity` is the D5 override of that aggregate when present.
 */
export async function processCountItem(
  db: Db,
  params: {
    storeId: string;
    routineId: string;
    collaboratorTelegramId: string;
    rawText: string;
    llmUsed: LlmProvider;
    item: AggregatedCountItem;
  },
): Promise<ProcessCountItemResult> {
  const { storeId, routineId, collaboratorTelegramId, rawText, llmUsed, item } = params;

  const supplyFound = await supplyRepo.findByCode(db, storeId, item.supply);
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

  const countForMatch = {
    reportedValue: item.quantity,
    actualQuantityReported: item.actualQuantity,
  };
  const reportedEffective = effectiveValue(countForMatch);
  const matched = decideMatch(countForMatch, expectedValue);

  const locationBreakdown: CountLocationBreakdown = item.locationBreakdown;

  const countCreated = await countRepo.insert(db, {
    routineId,
    supplyId: supplyFound.id,
    collaboratorTelegramId,
    rawText,
    reportedValue: item.quantity,
    actualQuantityReported: item.actualQuantity,
    locationBreakdown,
    expectedValue,
    matched,
    confirmedByCollaborator: true,
    llmUsed,
  });

  return {
    supplyTextOriginal: item.supply,
    found: true,
    supplyId: supplyFound.id,
    supplyName: supplyFound.name,
    countId: countCreated.id,
    matched,
    reportedValue: reportedEffective,
    expectedValue,
  };
}
