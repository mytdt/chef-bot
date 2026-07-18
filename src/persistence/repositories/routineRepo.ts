import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { routine } from "src/persistence/schema.js";

export async function findActiveByName(db: Db, storeId: string, name: string) {
  const [found] = await db
    .select()
    .from(routine)
    .where(and(eq(routine.storeId, storeId), eq(routine.name, name), eq(routine.active, true)))
    .limit(1);
  return found ?? null;
}
