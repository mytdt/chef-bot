import { eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { store } from "src/persistence/schema.js";

export async function findActiveStore(db: Db) {
  const [activeStore] = await db.select().from(store).where(eq(store.active, true)).limit(1);
  return activeStore ?? null;
}
