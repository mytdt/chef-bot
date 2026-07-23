/**
 * Count-message package → unit conversion factors (F1).
 *
 * Distinct from legacy Supply.unitsPerBox (unused by receipt XLSX, which reads
 * pre-converted "Qtd. Estoque"). These factors apply only when a count line is marked
 * as a package (PCT/CX in the free-text message). Do not reuse unitsPerBox here, and
 * do not store these in the DB for the MVP — change = code review + deploy.
 *
 * Chicken × 20 is an *approximation with a known low bias* (real packs often hold a
 * bit more than 20). Comparison stays exact anyway (human decision) — the bias is
 * accepted operationally, not papered over with a tolerance margin.
 */
export const COUNT_PACKAGE_TO_UNIT: ReadonlyMap<string, number> = new Map([
  ["CHICKEN", 20],
  ["VEGETARIANO", 2],
]);

export function countPackageToUnitFactor(supplyCode: string): number | null {
  return COUNT_PACKAGE_TO_UNIT.get(supplyCode.toUpperCase()) ?? null;
}
