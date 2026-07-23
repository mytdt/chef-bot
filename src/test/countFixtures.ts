import type { CountLocationBreakdown } from "src/persistence/schema.js";
import type { AggregatedCountItem } from "src/bot/parse.schema.js";

/** Minimal location breakdown for tests that don't care about per-line audit detail. */
export function testLocationBreakdown(
  mezaninoUnits: number,
  cozinhaUnits: number,
  supplyRaw = "G",
): CountLocationBreakdown {
  // Always include both location lines (even when quantity is 0) — matches the nested
  // parse shape where Zod requires both mezanino and cozinha blocks with ≥1 line each.
  return {
    mezanino: {
      units: mezaninoUnits,
      lines: [{ supplyRaw, quantity: mezaninoUnits, unitKind: "unit", units: mezaninoUnits }],
    },
    cozinha: {
      units: cozinhaUnits,
      lines: [{ supplyRaw, quantity: cozinhaUnits, unitKind: "unit", units: cozinhaUnits }],
    },
  };
}

export function testAggregatedItem(
  supply: string,
  quantity: number,
  overrides: Partial<AggregatedCountItem> = {},
): AggregatedCountItem {
  return {
    supply,
    quantity,
    actualQuantity: null,
    locationBreakdown: testLocationBreakdown(quantity, 0, supply),
    ...overrides,
  };
}

/** Nested LLM payload with both locations for bot-flow fakes. */
export function testParsedLocations(
  supply: string,
  mezaninoQty: number,
  cozinhaQty: number,
  date = "2026-07-22",
) {
  return {
    date,
    locations: [
      {
        location: "mezanino" as const,
        lines: [{ supplyRaw: supply, quantity: mezaninoQty, unitKind: "unit" as const }],
      },
      {
        location: "cozinha" as const,
        lines: [{ supplyRaw: supply, quantity: cozinhaQty, unitKind: "unit" as const }],
      },
    ],
  };
}
