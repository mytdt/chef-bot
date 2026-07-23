/**
 * B6: maps a waste report's SKU (its own numbering, distinct from both B1's menu-item
 * codes and B5's supplier codes) to this project's Supply.code.
 *
 * ⚠️ Built from a single real "Incompleto" PDF sample (22/07), which had exactly 2 SKUs:
 * - 508 "Queijo Gouda" — a real insumo (category "cheese"), but **not yet seeded** in
 *   seed.ts (only Burgers/Chicken/Vegetariano exist today) — mapped here anyway so it
 *   starts working the moment someone seeds a "QUEIJO_GOUDA" Supply, no code change
 *   needed. Until then it's skipped and reported (Supply not found), same as any other
 *   unmapped/unseeded code in this codebase.
 * - 511 "Coxinha Frango com Catupiry" — deliberately NOT mapped. Doesn't look like a
 *   tracked raw insumo (reads like a prepared snack item) — mapping it to something
 *   would be a guess, not a confirmed decision.
 *
 * The 23/07 XLSX sample introduced different SKUs (201/202/605) that are intentionally
 * not added here until confirmed as tracked insumos — unmapped SKUs are skipped and
 * reported by wasteIncompleteAdapter, not silently ignored forever.
 */
export const WASTE_SKU_MAP: ReadonlyMap<string, string> = new Map([["508", "QUEIJO_GOUDA"]]);
