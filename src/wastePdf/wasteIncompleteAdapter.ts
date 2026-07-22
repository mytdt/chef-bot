import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseWasteIncompleteReport } from "src/wastePdf/wasteIncompleteParser.js";
import { WASTE_SKU_MAP } from "src/wastePdf/wasteSkuMap.js";

export interface ProcessWasteIncompleteResult {
  hasData: boolean;
  inserted: { supplyCode: string; quantity: number }[];
  skippedUnmappedSkus: string[];
  skippedSupplyCodesNotFound: string[];
}

/**
 * B6 ("Incompleto"): turns the waste report's rows into InventoryMovement rows (type:
 * "waste", source: "xml_drive"), same defensive posture as B1/B5 — unmapped SKUs and
 * Supplies that don't exist yet are skipped and reported, not thrown.
 */
export async function processWasteIncompleteReport(db: Db, storeId: string, pdfText: string): Promise<ProcessWasteIncompleteResult> {
  const report = parseWasteIncompleteReport(pdfText);

  const result: ProcessWasteIncompleteResult = {
    hasData: report.hasData,
    inserted: [],
    skippedUnmappedSkus: [],
    skippedSupplyCodesNotFound: [],
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
