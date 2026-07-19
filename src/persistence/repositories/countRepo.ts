import { and, desc, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { count } from "src/persistence/schema.js";

export interface NewCount {
  routineId: string;
  supplyId: string;
  collaboratorTelegramId: string;
  rawText: string;
  reportedValue: number;
  actualQuantityReported: number | null;
  expectedValue: number;
  matched: boolean;
  confirmedByCollaborator: boolean;
}

// rawText is immutable: every count creates a new record, never an update.
export async function insert(db: Db, data: NewCount) {
  const [created] = await db.insert(count).values(data).returning();
  if (!created) {
    throw new Error("Failed to insert count.");
  }
  return created;
}

export async function findLastConfirmedBySupply(db: Db, supplyId: string) {
  const [last] = await db
    .select()
    .from(count)
    .where(and(eq(count.supplyId, supplyId), eq(count.confirmedByCollaborator, true)))
    .orderBy(desc(count.createdAt))
    .limit(1);
  return last ?? null;
}

export async function findById(db: Db, id: string) {
  const [found] = await db.select().from(count).where(eq(count.id, id)).limit(1);
  return found ?? null;
}
