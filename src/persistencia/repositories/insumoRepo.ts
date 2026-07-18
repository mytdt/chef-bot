import { and, eq, ilike } from "drizzle-orm";
import type { Db } from "src/persistencia/db.js";
import { insumo } from "src/persistencia/schema.js";
import type { CategoriaInsumo } from "src/dominio/tipos.js";

export async function buscarPorId(db: Db, id: string) {
  const [encontrado] = await db.select().from(insumo).where(eq(insumo.id, id)).limit(1);
  return encontrado ?? null;
}

export async function buscarPorNome(db: Db, lojaId: string, nome: string) {
  const [encontrado] = await db
    .select()
    .from(insumo)
    .where(and(eq(insumo.lojaId, lojaId), ilike(insumo.nome, nome), eq(insumo.ativo, true)))
    .limit(1);
  return encontrado ?? null;
}

export async function listarAtivosPorCategoria(db: Db, lojaId: string, categoria: CategoriaInsumo) {
  return db
    .select()
    .from(insumo)
    .where(and(eq(insumo.lojaId, lojaId), eq(insumo.categoria, categoria), eq(insumo.ativo, true)));
}
