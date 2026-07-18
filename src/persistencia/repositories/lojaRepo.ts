import { eq } from "drizzle-orm";
import type { Db } from "src/persistencia/db.js";
import { loja } from "src/persistencia/schema.js";

export async function buscarLojaAtiva(db: Db) {
  const [lojaAtiva] = await db.select().from(loja).where(eq(loja.ativa, true)).limit(1);
  return lojaAtiva ?? null;
}
