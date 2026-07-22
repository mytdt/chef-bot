import { describe, expect, it } from "vitest";
import { lookupProductMapping } from "src/salesXml/productMap.js";

describe("lookupProductMapping", () => {
  it("maps a known F product code with multiplier 1", () => {
    expect(lookupProductMapping("1001")).toEqual({ supplyCode: "F", multiplier: 1 });
  });

  it("maps a known G product code with multiplier 1", () => {
    expect(lookupProductMapping("1027")).toEqual({ supplyCode: "G", multiplier: 1 });
  });

  it("maps a double-F product code (multiplier 2)", () => {
    expect(lookupProductMapping("1005")).toEqual({ supplyCode: "F", multiplier: 2 });
  });

  it("maps a double-G product code (multiplier 2)", () => {
    expect(lookupProductMapping("2007")).toEqual({ supplyCode: "G", multiplier: 2 });
  });

  it("maps Wagyu products to supply code W", () => {
    expect(lookupProductMapping("1031")).toEqual({ supplyCode: "W", multiplier: 1 });
  });

  it("maps Chori products to supply code CHORI", () => {
    expect(lookupProductMapping("1022")).toEqual({ supplyCode: "CHORI", multiplier: 1 });
  });

  it("maps Chicken products to supply code CHICKEN", () => {
    expect(lookupProductMapping("1015")).toEqual({ supplyCode: "CHICKEN", multiplier: 1 });
  });

  it("maps Vegetariano products to supply code VEGETARIANO", () => {
    expect(lookupProductMapping("2024")).toEqual({ supplyCode: "VEGETARIANO", multiplier: 1 });
  });

  it("returns null for an unmapped product code", () => {
    expect(lookupProductMapping("999999999")).toBeNull();
  });
});
