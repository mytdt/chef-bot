import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { count } from "src/persistence/schema.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import * as routineRepo from "src/persistence/repositories/routineRepo.js";
import * as supplyRepo from "src/persistence/repositories/supplyRepo.js";
import {
  seedBaselineConfigSchema,
  type SeedBaselineConfig,
} from "src/persistence/seedBaseline.config.js";

/**
 * Staging / test-reset tool — NOT for production once real collaborator counts exist.
 *
 * `calculateExpectedValue` treats "no previous count" as baseline 0. For a test day that
 * is not the store's real first day of operation, physical stock is not zero: we need an
 * explicit previous Count row so expected-value math starts from the cutover stock.
 *
 * Idempotency: SKIP if a row already exists for the same (supply, createdAt, seed
 * collaborator id). Never replace/update — Count is immutable in this codebase, and
 * replacing could confuse a real count if someone re-ran this against production by
 * mistake. To change quantities: delete the seed-manual rows (or pick a new cutoff) and
 * run again.
 */

/** Distinct from any real Telegram user id — filters/audits can spot seed rows easily. */
export const BASELINE_COLLABORATOR_TELEGRAM_ID = "seed-manual";

export const BASELINE_RAW_TEXT = "ESTOQUE INICIAL MANUAL — baseline pré-teste";

const COUNT_ROUTINE_NAME = "Contagem de Carne";

const CUTOFF_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function parseBaselineCutoff(cutoffAt: string): Date {
  if (CUTOFF_LOCAL_PATTERN.test(cutoffAt)) {
    // Same fixed Brazil offset as domain/dateOnly.ts (Bom Beef / Boulevard Shopping).
    return new Date(`${cutoffAt.replace(" ", "T")}-03:00`);
  }
  const parsed = new Date(cutoffAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid cutoffAt "${cutoffAt}". Use "YYYY-MM-DD HH:mm:ss" (America/Sao_Paulo) or an ISO-8601 timestamp with offset.`,
    );
  }
  return parsed;
}

export type SeedBaselineItemResult =
  | { supplyCode: string; status: "inserted"; countId: string; quantity: number }
  | { supplyCode: string; status: "skipped"; countId: string; quantity: number };

export async function seedBaselineCounts(db: Db, rawConfig: SeedBaselineConfig): Promise<SeedBaselineItemResult[]> {
  const config = seedBaselineConfigSchema.parse(rawConfig);
  const cutoffAt = parseBaselineCutoff(config.cutoffAt);

  const activeStore = await storeRepo.findActiveStore(db);
  if (!activeStore) {
    throw new Error("No active store found — run `npm run seed` before seeding a baseline.");
  }

  const routine = await routineRepo.findActiveByName(db, activeStore.id, COUNT_ROUTINE_NAME);
  if (!routine) {
    throw new Error(
      `Active routine "${COUNT_ROUTINE_NAME}" not found for the active store — run \`npm run seed\` first.`,
    );
  }

  const results: SeedBaselineItemResult[] = [];

  for (const item of config.items) {
    const supplyFound = await supplyRepo.findByCode(db, activeStore.id, item.supplyCode);
    if (!supplyFound) {
      throw new Error(
        `Supply code "${item.supplyCode}" not found (or inactive) for the active store "${activeStore.name}". Check seed.ts / the config supplyCode.`,
      );
    }

    const [existing] = await db
      .select()
      .from(count)
      .where(
        and(
          eq(count.supplyId, supplyFound.id),
          eq(count.collaboratorTelegramId, BASELINE_COLLABORATOR_TELEGRAM_ID),
          eq(count.createdAt, cutoffAt),
        ),
      )
      .limit(1);

    if (existing) {
      results.push({
        supplyCode: item.supplyCode,
        status: "skipped",
        countId: existing.id,
        quantity: existing.reportedValue,
      });
      continue;
    }

    // Insert directly (not via countRepo): baseline needs an explicit createdAt at the
    // cutover instant. countRepo.insert always uses DB defaultNow() and must stay
    // unchanged for the real collaborator flow.
    const [created] = await db
      .insert(count)
      .values({
        routineId: routine.id,
        supplyId: supplyFound.id,
        collaboratorTelegramId: BASELINE_COLLABORATOR_TELEGRAM_ID,
        rawText: BASELINE_RAW_TEXT,
        reportedValue: item.quantity,
        actualQuantityReported: null,
        expectedValue: item.quantity,
        matched: true,
        confirmedByCollaborator: true,
        llmUsed: "claude",
        createdAt: cutoffAt,
      })
      .returning();

    if (!created) {
      throw new Error(`Failed to insert baseline count for supply "${item.supplyCode}".`);
    }

    results.push({
      supplyCode: item.supplyCode,
      status: "inserted",
      countId: created.id,
      quantity: item.quantity,
    });
  }

  return results;
}
