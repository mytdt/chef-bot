import { describe, expect, it } from "vitest";
import { parseBrNumber } from "src/wastePdf/wasteReportSchema.js";

describe("parseBrNumber", () => {
  it("parses a simple decimal (comma separator)", () => {
    expect(parseBrNumber("0,02")).toBeCloseTo(0.02);
  });

  it("parses a value with a thousands separator", () => {
    expect(parseBrNumber("1.234,56")).toBeCloseTo(1234.56);
  });

  it("parses an integer with no decimal part", () => {
    expect(parseBrNumber("53")).toBe(53);
  });

  it("throws on a non-numeric string", () => {
    expect(() => parseBrNumber("not a number")).toThrow();
  });
});
