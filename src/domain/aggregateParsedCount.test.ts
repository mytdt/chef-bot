import { describe, expect, it } from "vitest";
import { countParseSchema } from "src/bot/parse.schema.js";
import { aggregateParsedCount } from "src/domain/aggregateParsedCount.js";

/** Synthetic structure matching the real operational message (values from PLAN.md). */
const REAL_MESSAGE_PARSE = countParseSchema.parse({
  date: "2026-07-22",
  locations: [
    {
      location: "mezanino",
      lines: [
        { supplyRaw: "G", quantity: 857, unitKind: "unit" },
        { supplyRaw: "F", quantity: 836, unitKind: "unit" },
        { supplyRaw: "W", quantity: 330, unitKind: "unit" },
        { supplyRaw: "CHORI", quantity: 0, unitKind: "unit" },
        { supplyRaw: "PCT CHICKEN", quantity: 9, unitKind: "package" },
        { supplyRaw: "PCT VEGETARIANO", quantity: 20, unitKind: "package" },
      ],
    },
    {
      location: "cozinha",
      lines: [
        { supplyRaw: "G", quantity: 160, unitKind: "unit" },
        { supplyRaw: "F", quantity: 112, unitKind: "unit" },
        { supplyRaw: "W", quantity: 7, unitKind: "unit" },
        { supplyRaw: "VEGETARIANO", quantity: 5, unitKind: "unit" },
        { supplyRaw: "CHORI", quantity: 11, unitKind: "unit" },
        { supplyRaw: "PCT CHICKEN", quantity: 8, unitKind: "package" },
        { supplyRaw: "CHICKEN SESSÃO", quantity: 6, unitKind: "unit" },
      ],
    },
  ],
});

describe("aggregateParsedCount", () => {
  it("aggregates the real message example (Chicken PCT+Sessão, Vegetariano PCT vs unit)", () => {
    const { items, skipped } = aggregateParsedCount(REAL_MESSAGE_PARSE);

    expect(skipped).toEqual([]);

    const byCode = Object.fromEntries(items.map((item) => [item.supply, item]));

    expect(byCode.G?.quantity).toBe(857 + 160);
    expect(byCode.F?.quantity).toBe(836 + 112);
    expect(byCode.W?.quantity).toBe(330 + 7);
    expect(byCode.CHORI?.quantity).toBe(0 + 11);

    // Mezanino 9×20=180 + Cozinha 8×20=160 + 6 sessão = 346
    expect(byCode.CHICKEN?.quantity).toBe(346);
    expect(byCode.CHICKEN?.locationBreakdown.mezanino.units).toBe(180);
    expect(byCode.CHICKEN?.locationBreakdown.cozinha.units).toBe(166);

    // Mezanino 20×2=40 + Cozinha 5 unit = 45
    expect(byCode.VEGETARIANO?.quantity).toBe(45);
    expect(byCode.VEGETARIANO?.locationBreakdown.mezanino.units).toBe(40);
    expect(byCode.VEGETARIANO?.locationBreakdown.cozinha.units).toBe(5);
  });

  it("skips a package line without a registered factor (e.g. PCT G)", () => {
    const parsed = countParseSchema.parse({
      date: "2026-07-22",
      locations: [
        {
          location: "mezanino",
          lines: [
            { supplyRaw: "PCT G", quantity: 2, unitKind: "package" },
            { supplyRaw: "F", quantity: 10, unitKind: "unit" },
          ],
        },
        {
          location: "cozinha",
          lines: [{ supplyRaw: "F", quantity: 5, unitKind: "unit" }],
        },
      ],
    });

    const { items, skipped } = aggregateParsedCount(parsed);

    expect(skipped).toEqual([
      {
        location: "mezanino",
        supplyRaw: "PCT G",
        quantity: 2,
        unitKind: "package",
        reason: "package_without_factor",
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.supply).toBe("F");
    expect(items[0]?.quantity).toBe(15);
  });

  it("applies D5 actualQuantity as override of the aggregated total (not per location)", () => {
    const parsed = countParseSchema.parse({
      date: "2026-07-22",
      locations: [
        {
          location: "mezanino",
          lines: [{ supplyRaw: "PCT CHICKEN", quantity: 9, unitKind: "package", actualQuantity: 200 }],
        },
        {
          location: "cozinha",
          lines: [
            { supplyRaw: "PCT CHICKEN", quantity: 8, unitKind: "package" },
            { supplyRaw: "CHICKEN SESSÃO", quantity: 6, unitKind: "unit" },
          ],
        },
      ],
    });

    const { items } = aggregateParsedCount(parsed);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(346); // still the converted aggregate
    expect(items[0]?.actualQuantity).toBe(200); // D5 override of the total
  });

  it("skips unrecognized supply tokens", () => {
    const parsed = countParseSchema.parse({
      date: "2026-07-22",
      locations: [
        { location: "mezanino", lines: [{ supplyRaw: "XYZ", quantity: 1, unitKind: "unit" }] },
        { location: "cozinha", lines: [{ supplyRaw: "G", quantity: 10, unitKind: "unit" }] },
      ],
    });

    const { items, skipped } = aggregateParsedCount(parsed);
    expect(skipped[0]?.reason).toBe("unrecognized_supply");
    expect(items.map((i) => i.supply)).toEqual(["G"]);
  });
});
