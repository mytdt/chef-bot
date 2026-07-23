import { describe, expect, it } from "vitest";
import { countParseSchema } from "src/bot/parse.schema.js";

const bothLocations = (
  mezaninoLines: unknown[],
  cozinhaLines: unknown[],
  date = "2026-07-22",
) => ({
  date,
  locations: [
    { location: "mezanino", lines: mezaninoLines },
    { location: "cozinha", lines: cozinhaLines },
  ],
});

describe("countParseSchema", () => {
  it("accepts a valid nested parse with both locations (real message shape)", () => {
    const result = countParseSchema.safeParse(
      bothLocations(
        [
          { supplyRaw: "G", quantity: 857, unitKind: "unit" },
          { supplyRaw: "PCT CHICKEN", quantity: 9, unitKind: "package" },
        ],
        [
          { supplyRaw: "G", quantity: 160, unitKind: "unit" },
          { supplyRaw: "CHICKEN SESSÃO", quantity: 6, unitKind: "unit" },
        ],
      ),
    );

    expect(result.success).toBe(true);
  });

  it("defaults actualQuantity to null when omitted", () => {
    const result = countParseSchema.parse(
      bothLocations([{ supplyRaw: "G", quantity: 742, unitKind: "unit" }], [{ supplyRaw: "G", quantity: 0, unitKind: "unit" }]),
    );
    expect(result.locations[0]?.lines[0]?.actualQuantity).toBeNull();
  });

  it("rejects a message with only one location", () => {
    const result = countParseSchema.safeParse({
      date: "2026-07-22",
      locations: [{ location: "mezanino", lines: [{ supplyRaw: "G", quantity: 100, unitKind: "unit" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate mezanino blocks (must be exactly one of each)", () => {
    const result = countParseSchema.safeParse({
      date: "2026-07-22",
      locations: [
        { location: "mezanino", lines: [{ supplyRaw: "G", quantity: 1, unitKind: "unit" }] },
        { location: "mezanino", lines: [{ supplyRaw: "G", quantity: 2, unitKind: "unit" }] },
        { location: "cozinha", lines: [{ supplyRaw: "G", quantity: 3, unitKind: "unit" }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects JSON without the locations field", () => {
    const result = countParseSchema.safeParse({ date: "2026-07-22" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty lines array in a location", () => {
    const result = countParseSchema.safeParse(
      bothLocations([], [{ supplyRaw: "G", quantity: 1, unitKind: "unit" }]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a line with a non-numeric quantity", () => {
    const result = countParseSchema.safeParse(
      bothLocations(
        [{ supplyRaw: "G", quantity: "742", unitKind: "unit" }],
        [{ supplyRaw: "G", quantity: 0, unitKind: "unit" }],
      ),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a line without supplyRaw", () => {
    const result = countParseSchema.safeParse(
      bothLocations([{ quantity: 742, unitKind: "unit" }], [{ supplyRaw: "G", quantity: 0, unitKind: "unit" }]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects JSON without the date field", () => {
    const result = countParseSchema.safeParse({
      locations: [
        { location: "mezanino", lines: [{ supplyRaw: "G", quantity: 1, unitKind: "unit" }] },
        { location: "cozinha", lines: [{ supplyRaw: "G", quantity: 1, unitKind: "unit" }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it.each(["22/07/2026", "2026-7-22", "not-a-date", ""])("rejects a malformed date %s", (date) => {
    const result = countParseSchema.safeParse(
      bothLocations([{ supplyRaw: "G", quantity: 742, unitKind: "unit" }], [{ supplyRaw: "G", quantity: 0, unitKind: "unit" }], date),
    );
    expect(result.success).toBe(false);
  });
});
