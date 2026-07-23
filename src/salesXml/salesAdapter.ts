import type { Db } from "src/persistence/db.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import * as inventoryMovementRepo from "src/persistence/repositories/inventoryMovementRepo.js";
import { parseNfceXml } from "src/salesXml/nfceParser.js";
import { lookupProductMapping } from "src/salesXml/productMap.js";
import { isValidQuantity } from "src/domain/quantityRules.js";

export interface ProcessNfceSaleResult {
  skippedNonSale: boolean;
  inserted: { supplyCode: string; quantity: number }[];
  skippedUnmappedProductCodes: string[];
  skippedSupplyCodesNotFound: string[];
  skippedInvalidQuantity: { supplyCode: string; quantity: number }[];
}

/**
 * B1: turns one NFC-e sale document into InventoryMovement rows (source: "xml_drive").
 *
 * Only natOp === "venda" is processed. D8 confirmed every sampled NFC-e for this store
 * is a sale, but this check stays defensive rather than assuming the invariant always
 * holds — a cancellation/return document would have a different natOp.
 *
 * Product codes with no PRODUCT_MAP entry, or whose mapped Supply.code doesn't exist
 * for this store, are skipped and reported in the result rather than thrown — one
 * unrecognized line item on a 4-item receipt shouldn't block the other 3 from being
 * recorded. B2/B3 (not in scope here) decide what to do with a non-empty skipped-items
 * list (e.g. alert the group).
 *
 * Same posture applies to quantity: a computed quantity that violates
 * domain/quantityRules.ts (e.g. a fractional Burger count from an odd multiplier) is
 * skipped and reported, not inserted — this mirrors the check bot/handlers/movement.ts
 * and domain/count.ts already do for manually-entered quantities; auto-ingested
 * quantities need the same guarantee, since InventoryMovement doesn't enforce it at
 * the DB level (see quantityRules.ts's comment on why the column stays doublePrecision).
 */
export async function processNfceSale(db: Db, storeId: string, xmlContent: string): Promise<ProcessNfceSaleResult> {
  const parsed = parseNfceXml(xmlContent);
  const infNFe = parsed.nfeProc.NFe.infNFe;

  const result: ProcessNfceSaleResult = {
    skippedNonSale: false,
    inserted: [],
    skippedUnmappedProductCodes: [],
    skippedSupplyCodesNotFound: [],
    skippedInvalidQuantity: [],
  };

  if (infNFe.ide.natOp !== "venda") {
    result.skippedNonSale = true;
    return result;
  }

  for (const item of infNFe.det) {
    const mapping = lookupProductMapping(item.prod.cProd);
    if (!mapping) {
      result.skippedUnmappedProductCodes.push(item.prod.cProd);
      continue;
    }

    const supplyFound = await supplyRepo.findByCode(db, storeId, mapping.supplyCode);
    if (!supplyFound) {
      result.skippedSupplyCodesNotFound.push(mapping.supplyCode);
      continue;
    }

    const quantity = item.prod.qCom * mapping.multiplier;
    if (!isValidQuantity(supplyFound.category, quantity)) {
      result.skippedInvalidQuantity.push({ supplyCode: mapping.supplyCode, quantity });
      continue;
    }

    await inventoryMovementRepo.insert(db, {
      supplyId: supplyFound.id,
      type: "sale",
      quantity,
      source: "xml_drive",
    });
    result.inserted.push({ supplyCode: mapping.supplyCode, quantity });
  }

  return result;
}
