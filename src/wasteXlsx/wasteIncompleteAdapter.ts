import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseWasteIncompleteReport } from "src/wasteXlsx/wasteIncompleteParser.js";
import { WASTE_SKU_MAP } from "src/wasteXlsx/wasteSkuMap.js";
import { isValidQuantity } from "src/domain/quantityRules.js";

export interface ProcessWasteIncompleteResult {
  hasData: boolean;
  inserted: { supplyCode: string; quantity: number }[];
  skippedUnmappedSkus: string[];
  skippedSupplyCodesNotFound: string[];
  skippedInvalidQuantity: { supplyCode: string; quantity: number }[];
}

/**
 * B6 ("Incompleto"): turns the waste report's rows into InventoryMovement rows (type:
 * "waste", source: "xml_drive"), same defensive posture as B1/B5 — unmapped SKUs,
 * Supplies that don't exist yet, and a quantity that violates
 * domain/quantityRules.ts (e.g. a fractional Burger count) are all skipped and
 * reported, not thrown.
 */
export async function processWasteIncompleteReport(
  db: Db,
  storeId: string,
  xlsxBuffer: Buffer,
): Promise<ProcessWasteIncompleteResult> {
  const report = await parseWasteIncompleteReport(xlsxBuffer);

  const result: ProcessWasteIncompleteResult = {
    hasData: report.hasData,
    inserted: [],
    skippedUnmappedSkus: [],
    skippedSupplyCodesNotFound: [],
    skippedInvalidQuantity: [],
  };

  for (const row of report.rows) {
    const supplyCode = WASTE_SKU_MAP.get(row.sku);
    if (!supplyCode) {
      result.skippedUnmappedSkus.push(row.sku);
      continue;
    }

    const supplyFound = await supplyRepo.findByCode(db, storeId, supplyCode);
    if (!supplyFound) {
      result.skippedSupplyCodesNotFound.push(supplyCode);
      continue;
    }

    if (!isValidQuantity(supplyFound.category, row.quantity)) {
      result.skippedInvalidQuantity.push({ supplyCode, quantity: row.quantity });
      continue;
    }

    await inventoryMovementRepo.insert(db, {
      supplyId: supplyFound.id,
      type: "waste",
      quantity: row.quantity,
      source: "xml_drive",
    });
    result.inserted.push({ supplyCode, quantity: row.quantity });
  }

  return result;
}
