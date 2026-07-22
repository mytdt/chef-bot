import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseWasteCompleteReport } from "src/wastePdf/wasteCompleteParser.js";
import { lookupProductMapping } from "src/salesXml/productMap.js";

export interface ProcessWasteCompleteResult {
  hasData: boolean;
  inserted: { supplyCode: string; quantity: number }[];
  skippedUnmappedProductCodes: string[];
  skippedSupplyCodesNotFound: string[];
}

/**
 * B6 ("Completo"): turns whole-menu-item waste into InventoryMovement rows (type:
 * "waste", source: "xml_drive") by decomposing each item into the insumo it consumes —
 * reusing B1's salesXml/productMap.ts (the same recipe table sales already use), not a
 * separate table, since the report's "Cód." column was confirmed to be the same code
 * space as the sales NFC-e's `cProd` (see wasteReportSchema.ts). Same defensive
 * posture as B1/B5/wasteIncompleteAdapter: unmapped codes and missing Supplies are
 * skipped and reported, not thrown.
 */
export async function processWasteCompleteReport(db: Db, storeId: string, pdfText: string): Promise<ProcessWasteCompleteResult> {
  const report = parseWasteCompleteReport(pdfText);

  const result: ProcessWasteCompleteResult = {
    hasData: report.hasData,
    inserted: [],
    skippedUnmappedProductCodes: [],
    skippedSupplyCodesNotFound: [],
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
