import "dotenv/config";
import { createDb } from "src/persistence/db.js";
import { seedBaselineConfig } from "src/persistence/seedBaseline.config.js";
import { seedBaselineCounts } from "src/persistence/seedBaselineCounts.js";

/**
 * `npm run seed:baseline` — inserts matched, confirmed Count rows that act as the
 * "previous count" for expected-value math on a non-day-one staging/test run.
 *
 * ⚠️  Staging / test-reset only. Do NOT run in production after real collaborator
 * counts have accumulated. Idempotency is skip-only (never overwrite), but a mistaken
 * run can still insert an extra "previous" point if you pick a new cutoffAt, which
 * would then win `findLastConfirmedBySupply` ordered by created_at.
 *
 * Prerequisites: `npm run seed` (store, routine, supplies) already applied.
 * Config: edit `src/persistence/seedBaseline.config.ts`.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const db = createDb({ DATABASE_URL: databaseUrl });
  const results = await seedBaselineCounts(db, seedBaselineConfig);

  for (const result of results) {
    if (result.status === "inserted") {
      console.log(`Baseline inserted: ${result.supplyCode} = ${result.quantity} (${result.countId})`);
    } else {
      console.log(
        `Baseline skipped (already exists for this supply + cutoff): ${result.supplyCode} = ${result.quantity} (${result.countId})`,
      );
    }
  }

  console.log("Baseline seed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to seed baseline counts:", error instanceof Error ? error.message : error);
  process.exit(1);
});
