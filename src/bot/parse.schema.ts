import { z } from "zod";
import { DATE_ONLY_PATTERN } from "src/domain/dateOnly.js";
import type { CountLocationBreakdown } from "src/persistence/schema.js";

export const countLocationSchema = z.enum(["mezanino", "cozinha"]);
export type CountLocation = z.infer<typeof countLocationSchema>;

export const countUnitKindSchema = z.enum(["unit", "package"]);
export type CountUnitKind = z.infer<typeof countUnitKindSchema>;

/**
 * One raw line as extracted by the LLM — no math, no alias normalization.
 * `unitKind: "package"` means the text had PCT/CX; conversion happens later in code.
 * `actualQuantity` (D5) is rare: when present on any line for a supply, it overrides
 * that supply's *aggregated* total after conversion (not a per-location override).
 */
export const rawCountLineSchema = z.object({
  supplyRaw: z.string().min(1),
  quantity: z.number().finite(),
  unitKind: countUnitKindSchema,
  actualQuantity: z.number().finite().nullable().default(null),
});

export const locationBlockSchema = z.object({
  location: countLocationSchema,
  lines: z.array(rawCountLineSchema).min(1),
});

/**
 * Nested parse shape. Zod requires Mezanino AND Cozinha exactly once each — a message
 * with only one location fails validation (confirmed decision).
 */
export const countParseSchema = z
  .object({
    date: z.string().regex(DATE_ONLY_PATTERN, "date must be in YYYY-MM-DD format"),
    locations: z.array(locationBlockSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const counts: Record<CountLocation, number> = { mezanino: 0, cozinha: 0 };
    for (const block of data.locations) {
      counts[block.location] += 1;
    }
    if (counts.mezanino !== 1 || counts.cozinha !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "count must include both mezanino and cozinha exactly once",
        path: ["locations"],
      });
    }
  });

export type RawCountLine = z.infer<typeof rawCountLineSchema>;
export type LocationBlock = z.infer<typeof locationBlockSchema>;
export type ParsedCount = z.infer<typeof countParseSchema>;

/**
 * Post-conversion, post-aggregation item ready for D1 confirmation and Count insert.
 * `supply` is the canonical Supply.code; `quantity` is Mezanino+Cozinha units;
 * `actualQuantity` is the D5 aggregate override when present.
 */
export type AggregatedCountItem = {
  supply: string;
  quantity: number;
  actualQuantity: number | null;
  locationBreakdown: CountLocationBreakdown;
};

/** @deprecated Use AggregatedCountItem — kept as alias for call sites that still say CountItem. */
export type CountItem = AggregatedCountItem;
