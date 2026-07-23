import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseWasteCompleteReport } from "src/wasteXlsx/wasteCompleteParser.js";
import { lookupProductMapping } from "src/salesXml/productMap.js";
import { isValidQuantity } from "src/domain/quantityRules.js";

export interface ProcessWasteCompleteResult {
  hasData: boolean;
  inserted: { supplyCode: string; quantity: number }[];
  skippedUnmappedProductCodes: string[];
  skippedSupplyCodesNotFound: string[];
  skippedInvalidQuantity: { supplyCode: string; quantity: number }[];
}

/**
 * B6 ("Completo"): turns whole-menu-item waste into InventoryMovement rows (type:
 * "waste", source: "xml_drive") by decomposing each item into the insumo it consumes —
 * reusing B1's salesXml/productMap.ts (the same recipe table sales already use), not a
 * separate table, since the report's "SKU" column is the same code space as the sales
 * NFC-e's `cProd` (see wasteReportSchema.ts). Same defensive posture as
 * B1/B5/wasteIncompleteAdapter: unmapped codes, missing Supplies, and a computed
 * quantity that violates domain/quantityRules.ts (e.g. a fractional Burger count from
 * an odd multiplier) are all skipped and reported, not thrown.
 */
export async function processWasteCompleteReport(
  db: Db,
  storeId: string,
  xlsxBuffer: Buffer,
): Promise<ProcessWasteCompleteResult> {
  const report = await parseWasteCompleteReport(xlsxBuffer);

  const result: ProcessWasteCompleteResult = {
    hasData: report.hasData,
    inserted: [],
    skippedUnmappedProductCodes: [],
    skippedSupplyCodesNotFound: [],
    skippedInvalidQuantity: [],
  };

  for (const row of report.rows) {
    const mapping = lookupProductMapping(row.productCode);
    if (!mapping) {
      result.skippedUnmappedProductCodes.push(row.productCode);
      continue;
    }

    const supplyFound = await supplyRepo.findByCode(db, storeId, mapping.supplyCode);
    if (!supplyFound) {
      result.skippedSupplyCodesNotFound.push(mapping.supplyCode);
      continue;
    }

    const quantity = row.quantity * mapping.multiplier;
    if (!isValidQuantity(supplyFound.category, quantity)) {
      result.skippedInvalidQuantity.push({ supplyCode: mapping.supplyCode, quantity });
      continue;
    }

    await inventoryMovementRepo.insert(db, {
      supplyId: supplyFound.id,
      type: "waste",
      quantity,
      source: "xml_drive",
    });
    result.inserted.push({ supplyCode: mapping.supplyCode, quantity });
  }

  return result;
}
