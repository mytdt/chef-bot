import { describe, expect, it } from "vitest";
import { calculateExpectedValue, effectiveValue } from "src/calculation/expected.js";

describe("calculateExpectedValue", () => {
  it("calculates the expected value from the previous count and movements (normal case)", () => {
    const previousCount = { reportedValue: 380, actualQuantityReported: null };
    const expected = calculateExpectedValue(previousCount, {
      receipts: 500,
      sales: 400,
      waste: 10,
    });

    expect(expected).toBe(380 + 500 - 400 - 10);
  });

  it("uses 0 as the base when there is no previous count (first count for the supply)", () => {
    const expected = calculateExpectedValue(null, { receipts: 100, sales: 20, waste: 5 });

    expect(expected).toBe(75);
  });

  it("uses actualQuantityReported from the previous count instead of reportedValue (variable-quantity package, D5)", () => {
    const previousCount = { reportedValue: 12, actualQuantityReported: 9.5 };
    const expected = calculateExpectedValue(previousCount, {
      receipts: 0,
      sales: 2,
      waste: 0,
    });

    expect(expected).toBe(9.5 - 2);
  });
});

describe("effectiveValue", () => {
  it("returns reportedValue when there is no override", () => {
    expect(effectiveValue({ reportedValue: 742, actualQuantityReported: null })).toBe(742);
  });

  it("returns actualQuantityReported when present, ignoring reportedValue", () => {
    expect(effectiveValue({ reportedValue: 9, actualQuantityReported: 7.25 })).toBe(7.25);
  });
});
