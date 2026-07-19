import { describe, expect, it } from "vitest";
import { decideMatch } from "src/calculation/comparison.js";

describe("decideMatch", () => {
  it("returns true when the reported value is exactly equal to the expected value", () => {
    const matched = decideMatch({ reportedValue: 380, actualQuantityReported: null }, 380);
    expect(matched).toBe(true);
  });

  it("returns false when the reported value differs from the expected value, even slightly (no tolerance margin)", () => {
    const matched = decideMatch({ reportedValue: 379, actualQuantityReported: null }, 380);
    expect(matched).toBe(false);
  });

  it("uses actualQuantityReported (D5 override) instead of reportedValue in the comparison", () => {
    const matched = decideMatch({ reportedValue: 9, actualQuantityReported: 7.5 }, 7.5);
    expect(matched).toBe(true);
  });
});
