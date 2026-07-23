import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { dailyIngestionRun } from "src/persistence/schema.js";
import type { MovementType } from "src/domain/types.js";

const ALL_TYPES: readonly MovementType[] = ["sale", "receipt", "waste"];

export async function hasRunForDate(db: Db, storeId: string, date: string, type: MovementType): Promise<boolean> {
  const [found] = await db
    .select()
    .from(dailyIngestionRun)
    .where(and(eq(dailyIngestionRun.storeId, storeId), eq(dailyIngestionRun.date, date), eq(dailyIngestionRun.type, type)))
    .limit(1);
  return Boolean(found);
}

// Idempotent by design (unique(storeId, date, type)) — re-running /ingest_xml for the
// same day is a normal retry (D11: no scheduler, someone re-triggers by hand), not an
// error.
export async function recordRun(db: Db, storeId: string, date: string, type: MovementType): Promise<void> {
  await db.insert(dailyIngestionRun).values({ storeId, date, type }).onConflictDoNothing();
}

/**
 * 2026-07-22 fix: the "estado de espera" (confirmation.ts) used to release a count for
 * comparison as soon as *any* ingestion had run for its date — in practice, only sales,
 * since receipts/waste didn't exist yet. Now it must wait for all three movement types,
 * since a count compared against a "valor_esperado" missing that day's receipts or
 * waste would be wrong, not just incomplete.
 */
export async function hasAllTypesRunForDate(db: Db, storeId: string, date: string): Promise<boolean> {
  for (const type of ALL_TYPES) {
    if (!(await hasRunForDate(db, storeId, date, type))) {
      return false;
    }
  }
  return true;
}
