import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { alert } from "src/persistence/schema.js";

export async function insert(db: Db, countId: string) {
  const [created] = await db.insert(alert).values({ countId }).returning();
  if (!created) {
    throw new Error("Failed to insert alert.");
  }
  return created;
}

export async function findById(db: Db, id: string) {
  const [found] = await db.select().from(alert).where(eq(alert.id, id)).limit(1);
  return found ?? null;
}

export async function markAcknowledged(db: Db, id: string, acknowledgedBy: string) {
  await db
    .update(alert)
    .set({ acknowledged: true, acknowledgedBy, acknowledgedAt: new Date() })
    .where(eq(alert.id, id));
}

export async function markEscalated(db: Db, id: string, escalatedTo: string) {
  await db.update(alert).set({ escalated: true, escalatedTo }).where(eq(alert.id, id));
}

export async function listPendingEscalation(db: Db) {
  return db
    .select()
    .from(alert)
    .where(and(eq(alert.acknowledged, false), eq(alert.escalated, false)));
}
