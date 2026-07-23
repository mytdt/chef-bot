import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseReceiptReport } from "src/receiptXlsx/receiptParser.js";
import { isValidQuantity } from "src/domain/quantityRules.js";

export interface ProcessReceiptReportResult {
  hasData: boolean;
  inserted: { supplyCode: string; sku: number; quantity: number; recordedAt: Date }[];
  skippedUnknownSkus: number[];
  skippedInvalidQuantity: { supplyCode: string; sku: number; quantity: number }[];
}

/**
 * B5: "Notas_Fornecedores.xlsx" → InventoryMovement (type: "receipt", source: "xml_drive").
 * Quantity = "Qtd. Estoque" (already in stock units). Lookup by Supply.sku.
 * Same defensive posture as B1/B6 — unknown SKUs and invalid quantities are skipped
 * and reported, not thrown.
 */
export async function processReceiptReport(
  db: Db,
  storeId: string,
  xlsxBuffer: Buffer,
): Promise<ProcessReceiptReportResult> {
  const report = await parseReceiptReport(xlsxBuffer);

  const result: ProcessReceiptReportResult = {
    hasData: report.hasData,
    inserted: [],
    skippedUnknownSkus: [],
    skippedInvalidQuantity: [],
  };

  for (const row of report.rows) {
    const supplyFound = await supplyRepo.findBySku(db, storeId, row.sku);
    if (!supplyFound) {
      result.skippedUnknownSkus.push(row.sku);
      continue;
    }

    if (!isValidQuantity(supplyFound.category, row.stockQuantity)) {
      result.skippedInvalidQuantity.push({
        supplyCode: supplyFound.code,
        sku: row.sku,
        quantity: row.stockQuantity,
      });
      continue;
    }

    await inventoryMovementRepo.insert(db, {
      supplyId: supplyFound.id,
      type: "receipt",
      quantity: row.stockQuantity,
      source: "xml_drive",
      recordedAt: row.receivedAt,
    });
    result.inserted.push({
      supplyCode: supplyFound.code,
      sku: row.sku,
      quantity: row.stockQuantity,
      recordedAt: row.receivedAt,
    });
  }

  return result;
}
