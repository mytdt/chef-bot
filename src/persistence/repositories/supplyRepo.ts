import { and, eq, ilike } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { supply } from "src/persistence/schema.js";
import type { SupplyCategory } from "src/domain/types.js";

export async function findById(db: Db, id: string) {
  const [found] = await db.select().from(supply).where(eq(supply.id, id)).limit(1);
  return found ?? null;
}

// Used by manual movement commands (/recebimento, /venda, /desperdicio), where staff type
// the friendly display name.
export async function findByName(db: Db, storeId: string, name: string) {
  const [found] = await db
    .select()
    .from(supply)
    .where(and(eq(supply.storeId, storeId), ilike(supply.name, name), eq(supply.active, true)))
    .limit(1);
  return found ?? null;
}

// Used by the LLM-parsed count flow, where the raw text carries the short code (e.g. "G").
export async function findByCode(db: Db, storeId: string, code: string) {
  const [found] = await db
    .select()
    .from(supply)
    .where(and(eq(supply.storeId, storeId), ilike(supply.code, code), eq(supply.active, true)))
    .limit(1);
  return found ?? null;
}

export async function listActiveByCategory(db: Db, storeId: string, category: SupplyCategory) {
  return db
    .select()
    .from(supply)
    .where(and(eq(supply.storeId, storeId), eq(supply.category, category), eq(supply.active, true)));
}
