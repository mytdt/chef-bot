import type { SupplyCategory } from "src/domain/types.js";

/**
 * Burgers are always counted in whole units (see SPEC example "742 G / 689 F / 380 W").
 * Enforced at the input boundary rather than the DB column type: schema.ts keeps
 * quantity columns as doublePrecision so future categories (cheese, sauce) can use
 * fractional units (kg, liters) without a schema migration. Once this invariant
 * holds, exact `===` comparison in calculation/comparison.ts is safe — integers up
 * to 2^53 are represented exactly in IEEE754 doubles, so no float rounding error
 * can occur for burger quantities.
 */
const CATEGORIES_REQUIRING_INTEGER_QUANTITY: ReadonlySet<SupplyCategory> = new Set(["burger"]);

export function requiresIntegerQuantity(category: SupplyCategory): boolean {
  return CATEGORIES_REQUIRING_INTEGER_QUANTITY.has(category);
}

export function isValidQuantity(category: SupplyCategory, quantity: number): boolean {
  return !requiresIntegerQuantity(category) || Number.isInteger(quantity);
}
