export interface CountWithOverride {
  reportedValue: number;
  actualQuantityReported: number | null;
}

export interface MovementsSinceLastCount {
  receipts: number;
  sales: number;
  waste: number;
}

/**
 * D5: when the collaborator reports the actual quantity while opening a
 * variable-quantity package, that value takes precedence over the originally
 * reported value — only for that count, without changing the Supply's default.
 */
export function effectiveValue(count: CountWithOverride): number {
  return count.actualQuantityReported ?? count.reportedValue;
}

/**
 * Expected = Receipts + Previous Count − Sales − Waste.
 * Fixed formula validated in production (spreadsheet) — do not change without human validation.
 */
export function calculateExpectedValue(
  previousCount: CountWithOverride | null,
  movements: MovementsSinceLastCount,
): number {
  const previousBase = previousCount ? effectiveValue(previousCount) : 0;
  return previousBase + movements.receipts - movements.sales - movements.waste;
}
