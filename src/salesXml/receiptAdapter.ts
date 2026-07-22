import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseNfe55Xml } from "src/salesXml/nfe55Parser.js";
import { SUPPLIER_PRODUCT_MAP } from "src/salesXml/supplierProductMap.js";

export interface ProcessNfeReceiptResult {
  skippedWrongModel: boolean;
  inserted: { supplyCode: string; quantity: number }[];
  skippedUnmappedProductCodes: string[];
  skippedSupplyCodesNotFound: string[];
  skippedMissingUnitsPerBox: string[];
}

/**
 * B5: turns one supplier receiving note (NFe modelo 55) into InventoryMovement rows
 * (type: "receipt", source: "xml_drive").
 *
 * `qCom` on this document type is in boxes ("CX" in the one real sample seen so far),
 * not the unit collaborators count in — converted via Supply.unitsPerBox, a fixed
 * master-data value (confirmed 22/07), not derived from parsing `xProd`'s free text
 * (fragile — box weight/count varies per SKU and isn't in a consistent position in the
 * description string).
 *
 * Same defensive posture as B1/salesAdapter.ts: unmapped product codes, Supply not
 * found, and missing unitsPerBox are all skipped and reported rather than thrown — one
 * bad line item on a multi-item receipt shouldn't block the others.
 */
export async function processNfeReceipt(db: Db, storeId: string, xmlContent: string): Promise<ProcessNfeReceiptResult> {
  const parsed = parseNfe55Xml(xmlContent);
  const infNFe = parsed.nfeProc.NFe.infNFe;

  const result: ProcessNfeReceiptResult = {
    skippedWrongModel: false,
    inserted: [],
    skippedUnmappedProductCodes: [],
    skippedSupplyCodesNotFound: [],
    skippedMissingUnitsPerBox: [],
  };

  if (infNFe.ide.mod !== "55") {
    result.skippedWrongModel = true;
    return result;
  }

  for (const item of infNFe.det) {
    const supplyCode = SUPPLIER_PRODUCT_MAP.get(item.prod.cProd);
    if (!supplyCode) {
      result.skippedUnmappedProductCodes.push(item.prod.cProd);
      continue;
    }

    const supplyFound = await supplyRepo.findByCode(db, storeId, supplyCode);
    if (!supplyFound) {
      result.skippedSupplyCodesNotFound.push(supplyCode);
      continue;
    }

    if (supplyFound.unitsPerBox === null) {
      result.skippedMissingUnitsPerBox.push(supplyCode);
      continue;
    }

    const quantity = item.prod.qCom * supplyFound.unitsPerBox;
    await inventoryMovementRepo.insert(db, {
      supplyId: supplyFound.id,
      type: "receipt",
      quantity,
      source: "xml_drive",
    });
    result.inserted.push({ supplyCode, quantity });
  }

  return result;
}
