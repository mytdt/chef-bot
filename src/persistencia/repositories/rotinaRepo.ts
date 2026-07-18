import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistencia/db.js";
import { rotina } from "src/persistencia/schema.js";

export async function buscarAtivaPorNome(db: Db, lojaId: string, nome: string) {
  const [encontrada] = await db
    .select()
    .from(rotina)
    .where(and(eq(rotina.lojaId, lojaId), eq(rotina.nome, nome), eq(rotina.ativa, true)))
    .limit(1);
  return encontrada ?? null;
}
