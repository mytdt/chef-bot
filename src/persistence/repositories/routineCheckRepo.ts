import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import type { LlmProvider, RoutineCheckStatus, VerificationType } from "src/domain/types.js";
import { routineCheck } from "src/persistence/schema.js";

export interface NewRoutineCheck {
  routineId: string;
  storeId: string;
  supplyId: string | null;
  verificationType: VerificationType;
  status: RoutineCheckStatus;
  collaboratorTelegramId: string;
  confirmedByTelegramId: string | null;
  rawText: string;
  llmUsed?: LlmProvider;
  createdAt?: Date;
  payload?: unknown;
}

export async function insert(db: Db, data: NewRoutineCheck) {
  const [created] = await db
    .insert(routineCheck)
    .values({
      routineId: data.routineId,
      storeId: data.storeId,
      supplyId: data.supplyId,
      verificationType: data.verificationType,
      status: data.status,
      collaboratorTelegramId: data.collaboratorTelegramId,
      confirmedByTelegramId: data.confirmedByTelegramId,
      rawText: data.rawText,
      llmUsed: data.llmUsed ?? "claude",
      payload: data.payload ?? null,
      ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
    })
    .returning();
  if (!created) {
    throw new Error("Failed to insert routine_check.");
  }
  return created;
}

export async function findById(db: Db, id: string) {
  const [found] = await db.select().from(routineCheck).where(eq(routineCheck.id, id)).limit(1);
  return found ?? null;
}

/**
 * Write-once accept. Returns the updated row, or null if already accepted / missing.
 */
export async function acceptIfPending(
  db: Db,
  routineCheckId: string,
  acceptedByTelegramId: string,
): Promise<(typeof routineCheck.$inferSelect) | null> {
  const [updated] = await db
    .update(routineCheck)
    .set({
      status: "accepted",
      acceptedByTelegramId,
      acceptedAt: new Date(),
    })
    .where(and(eq(routineCheck.id, routineCheckId), isNull(routineCheck.acceptedAt)))
    .returning();
  return updated ?? null;
}

export async function findLatestUnacceptedMismatchBySupply(db: Db, storeId: string, supplyId: string) {
  const [found] = await db
    .select()
    .from(routineCheck)
    .where(
      and(
        eq(routineCheck.storeId, storeId),
        eq(routineCheck.supplyId, supplyId),
        eq(routineCheck.status, "mismatched"),
        isNull(routineCheck.acceptedAt),
      ),
    )
    .orderBy(desc(routineCheck.createdAt))
    .limit(1);
  return found ?? null;
}

export async function findLatestBySupply(db: Db, storeId: string, supplyId: string) {
  const [found] = await db
    .select()
    .from(routineCheck)
    .where(and(eq(routineCheck.storeId, storeId), eq(routineCheck.supplyId, supplyId)))
    .orderBy(desc(routineCheck.createdAt))
    .limit(1);
  return found ?? null;
}
