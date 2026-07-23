import { effectiveValue, type CountWithOverride } from "src/calculation/expected.js";

/**
 * Compares the effective reported value against the expected value by exact equality
 * (no tolerance margin, confirmed decision). Safe for burgers because
 * domain/quantityRules.ts guarantees integer quantities at the input boundary before
 * a count ever reaches this function — see that file for the float-precision rationale.
 *
 * Who may see `expectedValue` is a messaging concern (caller's): the consolidated
 * group alert now includes numbers (D1 amendment); this function only returns boolean.
 */
export function decideMatch(currentCount: CountWithOverride, expectedValue: number): boolean {
  return effectiveValue(currentCount) === expectedValue;
}
