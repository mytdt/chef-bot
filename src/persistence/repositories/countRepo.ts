import { and, desc, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import type { LlmProvider } from "src/domain/types.js";
import type { CountLocationBreakdown } from "src/persistence/schema.js";
import { count } from "src/persistence/schema.js";

export interface NewCount {
  routineId: string;
  supplyId: string;
  collaboratorTelegramId: string;
  rawText: string;
  reportedValue: number;
  actualQuantityReported: number | null;
  locationBreakdown: CountLocationBreakdown | null;
  expectedValue: number;
  matched: boolean;
  confirmedByCollaborator: boolean;
  llmUsed?: LlmProvider;
}

// rawText is immutable: every count creates a new record, never an update.
export async function insert(db: Db, data: NewCount) {
  const [created] = await db
    .insert(count)
    .values({
      ...data,
      llmUsed: data.llmUsed ?? "claude",
      locationBreakdown: data.locationBreakdown ?? null,
    })
    .returning();
  if (!created) {
    throw new Error("Failed to insert count.");
  }
  return created;
}

/**
 * Baseline for the next expected-value calculation: last collaborator-confirmed count
 * that *matched*. A confirmed-but-mismatched recount must not become the previous
 * count — otherwise the next attempt "chases its own tail" (reported value from the
 * failed attempt becomes the new expected). Seed baselines insert matched=true.
 */
export async function findLastConfirmedBySupply(db: Db, supplyId: string) {
  const [last] = await db
    .select()
    .from(count)
    .where(
      and(eq(count.supplyId, supplyId), eq(count.confirmedByCollaborator, true), eq(count.matched, true)),
    )
    .orderBy(desc(count.createdAt))
    .limit(1);
  return last ?? null;
}

export async function findById(db: Db, id: string) {
  const [found] = await db.select().from(count).where(eq(count.id, id)).limit(1);
  return found ?? null;
}
