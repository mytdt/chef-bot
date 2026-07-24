import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import type { LlmProvider } from "src/domain/types.js";
import type { CountLocationBreakdown } from "src/persistence/schema.js";
import { count, routineCheck } from "src/persistence/schema.js";
import * as routineCheckRepo from "src/persistence/repositories/routineCheckRepo.js";

export interface NewCount {
  storeId: string;
  routineId: string;
  supplyId: string;
  collaboratorTelegramId: string;
  /** Who clicked D1 Confirm — stored on routine_check. */
  confirmedByTelegramId: string | null;
  rawText: string;
  reportedValue: number;
  actualQuantityReported: number | null;
  locationBreakdown: CountLocationBreakdown | null;
  expectedValue: number;
  matched: boolean;
  confirmedByCollaborator: boolean;
  llmUsed?: LlmProvider;
  verificationType?: "expected_numeric";
}

// rawText is immutable: every count creates a new record, never an update.
// Creates the routine_check envelope first (G2), then the typed Count payload.
export async function insert(db: Db, data: NewCount) {
  const check = await routineCheckRepo.insert(db, {
    routineId: data.routineId,
    storeId: data.storeId,
    supplyId: data.supplyId,
    verificationType: data.verificationType ?? "expected_numeric",
    status: data.matched ? "matched" : "mismatched",
    collaboratorTelegramId: data.collaboratorTelegramId,
    confirmedByTelegramId: data.confirmedByTelegramId,
    rawText: data.rawText,
    llmUsed: data.llmUsed,
  });

  const [created] = await db
    .insert(count)
    .values({
      routineCheckId: check.id,
      routineId: data.routineId,
      supplyId: data.supplyId,
      collaboratorTelegramId: data.collaboratorTelegramId,
      rawText: data.rawText,
      reportedValue: data.reportedValue,
      actualQuantityReported: data.actualQuantityReported,
      locationBreakdown: data.locationBreakdown ?? null,
      expectedValue: data.expectedValue,
      matched: data.matched,
      confirmedByCollaborator: data.confirmedByCollaborator,
      llmUsed: data.llmUsed ?? "claude",
    })
    .returning();
  if (!created) {
    throw new Error("Failed to insert count.");
  }
  return created;
}

/**
 * Baseline for the next expected-value calculation: last collaborator-confirmed count
 * that matched OR whose routine_check was accepted (/aceitar). A confirmed-but-
 * mismatched recount that was NOT accepted must not become the previous count
 * (PR #27). Seed baselines insert matched=true.
 */
export async function findLastConfirmedBySupply(db: Db, supplyId: string) {
  const [last] = await db
    .select({ count })
    .from(count)
    .innerJoin(routineCheck, eq(count.routineCheckId, routineCheck.id))
    .where(
      and(
        eq(count.supplyId, supplyId),
        eq(count.confirmedByCollaborator, true),
        or(eq(count.matched, true), isNotNull(routineCheck.acceptedAt)),
      ),
    )
    .orderBy(desc(count.createdAt))
    .limit(1);
  return last?.count ?? null;
}

export async function findById(db: Db, id: string) {
  const [found] = await db.select().from(count).where(eq(count.id, id)).limit(1);
  return found ?? null;
}

export async function findByRoutineCheckId(db: Db, routineCheckId: string) {
  const [found] = await db.select().from(count).where(eq(count.routineCheckId, routineCheckId)).limit(1);
  return found ?? null;
}
