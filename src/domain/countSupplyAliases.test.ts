import { describe, expect, it } from "vitest";
import { normalizeCountSupplyCode } from "src/domain/countSupplyAliases.js";
import { countPackageToUnitFactor } from "src/domain/countPackageFactors.js";

describe("normalizeCountSupplyCode", () => {
  it.each([
    ["G", "G"],
    ["g", "G"],
    ["PCT CHICKEN", "CHICKEN"],
    ["pct chicken", "CHICKEN"],
    ["CHICKEN SESSÃO", "CHICKEN"],
    ["CHICKEN SESSAO", "CHICKEN"],
    ["VEGETARIANO", "VEGETARIANO"],
    ["PCT VEGETARIANO", "VEGETARIANO"],
    ["CHORI", "CHORI"],
  ])("maps %s → %s", (raw, expected) => {
    expect(normalizeCountSupplyCode(raw)).toBe(expected);
  });

  it("returns null for unknown tokens", () => {
    expect(normalizeCountSupplyCode("BATATA")).toBeNull();
  });
});

describe("countPackageToUnitFactor", () => {
  it("returns 20 for CHICKEN (approx, known low bias)", () => {
    expect(countPackageToUnitFactor("CHICKEN")).toBe(20);
  });

  it("returns 2 for VEGETARIANO", () => {
    expect(countPackageToUnitFactor("VEGETARIANO")).toBe(2);
  });

  it("returns null for supplies without a count-package factor (e.g. G)", () => {
    expect(countPackageToUnitFactor("G")).toBeNull();
  });
});
