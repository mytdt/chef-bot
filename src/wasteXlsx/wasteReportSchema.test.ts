import { describe, expect, it } from "vitest";
import { parseBrNumber } from "src/wasteXlsx/wasteReportSchema.js";
import { excelSerialToUtcDate, formatDdMmYyyy } from "src/wasteXlsx/xlsxCells.js";

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

describe("excelSerialToUtcDate", () => {
  it("converts the serial seen in the real Incompleto sample (46225 → 22/07/2026)", () => {
    expect(formatDdMmYyyy(excelSerialToUtcDate(46225))).toBe("22/07/2026");
  });
});
