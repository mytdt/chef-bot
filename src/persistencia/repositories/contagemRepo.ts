import { and, desc, eq } from "drizzle-orm";
import type { Db } from "src/persistencia/db.js";
import { contagem } from "src/persistencia/schema.js";

export interface NovaContagem {
  rotinaId: string;
  insumoId: string;
  colaboradorTelegramId: string;
  textoBruto: string;
  valorInformado: number;
  quantidadeRealInformada: number | null;
  valorEsperado: number;
  bateu: boolean;
  confirmadoPeloColaborador: boolean;
}

// texto_bruto é imutável: toda contagem gera um novo registro, nunca um update.
export async function inserir(db: Db, dados: NovaContagem) {
  const [criada] = await db.insert(contagem).values(dados).returning();
  if (!criada) {
    throw new Error("Falha ao inserir contagem.");
  }
  return criada;
}

export async function buscarUltimaConfirmadaPorInsumo(db: Db, insumoId: string) {
  const [ultima] = await db
    .select()
    .from(contagem)
    .where(and(eq(contagem.insumoId, insumoId), eq(contagem.confirmadoPeloColaborador, true)))
    .orderBy(desc(contagem.criadoEm))
    .limit(1);
  return ultima ?? null;
}

export async function buscarPorId(db: Db, id: string) {
  const [encontrada] = await db.select().from(contagem).where(eq(contagem.id, id)).limit(1);
  return encontrada ?? null;
}
