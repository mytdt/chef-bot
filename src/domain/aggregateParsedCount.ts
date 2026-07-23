import type { ParsedCount, AggregatedCountItem, CountLocation, CountUnitKind } from "src/bot/parse.schema.js";
import { countPackageToUnitFactor } from "src/domain/countPackageFactors.js";
import { normalizeCountSupplyCode } from "src/domain/countSupplyAliases.js";
import type { CountLocationBreakdown, CountLocationBreakdownLine } from "src/persistence/schema.js";

export type SkippedCountLine = {
  location: CountLocation;
  supplyRaw: string;
  quantity: number;
  unitKind: CountUnitKind;
  reason: "unrecognized_supply" | "package_without_factor";
};

export type AggregateParsedCountResult = {
  items: AggregatedCountItem[];
  skipped: SkippedCountLine[];
};

type WorkingLine = CountLocationBreakdownLine & {
  actualQuantity: number | null;
};

/**
 * Raw nested parse → canonical codes + package→unit conversion + aggregation.
 *
 * Order: normalize alias → convert package lines (skip if no factor) → sum by
 * (location, code) → sum locations → apply D5 (first non-null actualQuantity on any
 * contributing line becomes the aggregate override).
 */
export function aggregateParsedCount(parsed: ParsedCount): AggregateParsedCountResult {
  const skipped: SkippedCountLine[] = [];
  const bySupply = new Map<
    string,
    {
      mezanino: WorkingLine[];
      cozinha: WorkingLine[];
    }
  >();

  for (const block of parsed.locations) {
    for (const line of block.lines) {
      const supplyCode = normalizeCountSupplyCode(line.supplyRaw);
      if (!supplyCode) {
        skipped.push({
          location: block.location,
          supplyRaw: line.supplyRaw,
          quantity: line.quantity,
          unitKind: line.unitKind,
          reason: "unrecognized_supply",
        });
        continue;
      }

      let units: number;
      if (line.unitKind === "package") {
        const factor = countPackageToUnitFactor(supplyCode);
        if (factor === null) {
          skipped.push({
            location: block.location,
            supplyRaw: line.supplyRaw,
            quantity: line.quantity,
            unitKind: line.unitKind,
            reason: "package_without_factor",
          });
          continue;
        }
        units = line.quantity * factor;
      } else {
        units = line.quantity;
      }

      let bucket = bySupply.get(supplyCode);
      if (!bucket) {
        bucket = { mezanino: [], cozinha: [] };
        bySupply.set(supplyCode, bucket);
      }
      bucket[block.location].push({
        supplyRaw: line.supplyRaw,
        quantity: line.quantity,
        unitKind: line.unitKind,
        units,
        actualQuantity: line.actualQuantity,
      });
    }
  }

  const items: AggregatedCountItem[] = [];

  for (const [supply, bucket] of bySupply) {
    const mezaninoUnits = bucket.mezanino.reduce((sum, line) => sum + line.units, 0);
    const cozinhaUnits = bucket.cozinha.reduce((sum, line) => sum + line.units, 0);
    const quantity = mezaninoUnits + cozinhaUnits;

    const allLines = [...bucket.mezanino, ...bucket.cozinha];
    const actualQuantity = allLines.map((line) => line.actualQuantity).find((value) => value !== null) ?? null;

    const locationBreakdown: CountLocationBreakdown = {
      mezanino: {
        units: mezaninoUnits,
        lines: bucket.mezanino.map(stripWorkingFields),
      },
      cozinha: {
        units: cozinhaUnits,
        lines: bucket.cozinha.map(stripWorkingFields),
      },
    };

    items.push({ supply, quantity, actualQuantity, locationBreakdown });
  }

  // Stable order for D1 / tests: alphabetical by canonical code.
  items.sort((a, b) => a.supply.localeCompare(b.supply));

  return { items, skipped };
}

function stripWorkingFields(line: WorkingLine): CountLocationBreakdownLine {
  return {
    supplyRaw: line.supplyRaw,
    quantity: line.quantity,
    unitKind: line.unitKind,
    units: line.units,
  };
}
