import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistencia/db.js";
import { alerta } from "src/persistencia/schema.js";

export async function inserir(db: Db, contagemId: string) {
  const [criado] = await db.insert(alerta).values({ contagemId }).returning();
  if (!criado) {
    throw new Error("Falha ao inserir alerta.");
  }
  return criado;
}

export async function buscarPorId(db: Db, id: string) {
  const [encontrado] = await db.select().from(alerta).where(eq(alerta.id, id)).limit(1);
  return encontrado ?? null;
}

export async function marcarReconhecido(db: Db, id: string, reconhecidoPor: string) {
  await db
    .update(alerta)
    .set({ reconhecido: true, reconhecidoPor, reconhecidoEm: new Date() })
    .where(eq(alerta.id, id));
}

export async function marcarEscalonado(db: Db, id: string, escalonadoPara: string) {
  await db.update(alerta).set({ escalonado: true, escalonadoPara }).where(eq(alerta.id, id));
}

export async function listarPendentesDeEscalonamento(db: Db) {
  return db
    .select()
    .from(alerta)
    .where(and(eq(alerta.reconhecido, false), eq(alerta.escalonado, false)));
}
