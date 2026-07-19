import { describe, expect, it } from "vitest";
import { isValidQuantity, requiresIntegerQuantity } from "src/domain/quantityRules.js";

describe("requiresIntegerQuantity", () => {
  it("requires integer quantities for burger", () => {
    expect(requiresIntegerQuantity("burger")).toBe(true);
  });

  it("does not require integer quantities for other categories", () => {
    expect(requiresIntegerQuantity("cheese")).toBe(false);
    expect(requiresIntegerQuantity("sauce")).toBe(false);
  });
});

describe("isValidQuantity", () => {
  it("accepts integer quantities for burger", () => {
    expect(isValidQuantity("burger", 742)).toBe(true);
  });

  it("rejects fractional quantities for burger", () => {
    expect(isValidQuantity("burger", 742.5)).toBe(false);
  });

  it("accepts fractional quantities for categories without the integer rule", () => {
    expect(isValidQuantity("cheese", 2.5)).toBe(true);
  });
});
