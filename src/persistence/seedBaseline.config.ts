import { z } from "zod";

const baselineItemSchema = z.object({
  supplyCode: z.string().min(1),
  quantity: z.number().finite().nonnegative(),
});

export const seedBaselineConfigSchema = z.object({
  cutoffAt: z.string().min(1),
  items: z.array(baselineItemSchema).min(1),
});

export type SeedBaselineConfig = z.infer<typeof seedBaselineConfigSchema>;

/**
 * Staging/test config for `npm run seed:baseline`.
 *
 * Edit `cutoffAt` and `items` to match the physical stock at the cutover moment
 * before a test day. This is NOT production master data — see seedBaseline.ts.
 *
 * `cutoffAt` accepts either:
 * - `"YYYY-MM-DD HH:mm:ss"` (interpreted as America/Sao_Paulo, UTC−03:00), or
 * - a full ISO-8601 string with an explicit offset (e.g. `"2026-07-20T23:59:59-03:00"`).
 */
export const seedBaselineConfig: SeedBaselineConfig = {
  cutoffAt: "2026-07-20 23:59:59",
  items: [
    // Placeholder quantities — replace with the real physical stock at cutoff
    // before relying on expected-value checks for a non-day-one test.
    { supplyCode: "F", quantity: 0 },
    { supplyCode: "G", quantity: 0 },
    { supplyCode: "W", quantity: 0 },
    { supplyCode: "CHORI", quantity: 0 },
    { supplyCode: "CHICKEN", quantity: 0 },
    { supplyCode: "VEGETARIANO", quantity: 0 },
  ],
};
