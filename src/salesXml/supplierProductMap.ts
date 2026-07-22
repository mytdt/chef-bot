/**
 * B5: maps a supplier's own product code (prod.cProd on a receiving note, NFe modelo
 * 55) to this project's Supply.code — a completely different code space from B1's
 * PRODUCT_MAP (which maps *menu item* codes from sales NFC-e).
 *
 * ⚠️ Built from a single real sample (22/07, one meat supplier) — only 3 codes
 * confirmed. If that supplier's catalog has more SKUs, or a second supplier is used,
 * this table needs more entries before those receipts would be counted (unmapped codes
 * are skipped and reported, not silently dropped — see receiptAdapter.ts). Supplier
 * name/CNPJ deliberately not recorded here — that's commercial data, not something
 * this table needs to function.
 */
export const SUPPLIER_PRODUCT_MAP: ReadonlyMap<string, string> = new Map([
  ["052700.0160006", "G"], // "HB S/TEMP 160G D11,5 CX 5,76KG (479AC)"
  ["052700.0090006", "F"], // "HB S/TEMP 90G D11 CX 4,86KG (479AC)"
  ["052100.0200007", "W"], // "HB S/TEMP WAGYU 200G D10,5 CX 6KG MN (007)"
]);
