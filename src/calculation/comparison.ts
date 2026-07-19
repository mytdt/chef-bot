import { effectiveValue, type CountWithOverride } from "src/calculation/expected.js";

/**
 * Blind count: compares the effective reported value against the expected value by
 * exact equality (no tolerance margin, confirmed decision). Safe for burgers because
 * domain/quantityRules.ts guarantees integer quantities at the input boundary before
 * a count ever reaches this function — see that file for the float-precision rationale.
 * The expected value must never be exposed to the collaborator in any message — that's
 * the caller's responsibility, not this function's.
 */
export function decideMatch(currentCount: CountWithOverride, expectedValue: number): boolean {
  return effectiveValue(currentCount) === expectedValue;
}
