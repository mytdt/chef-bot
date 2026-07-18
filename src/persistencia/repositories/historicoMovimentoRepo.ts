import { and, eq, gt } from "drizzle-orm";
import type { Db } from "src/persistencia/db.js";
import { historicoMovimento } from "src/persistencia/schema.js";
import type { MovimentosDesdeUltimaContagem } from "src/calculo/esperado.js";
import type { OrigemMovimento, TipoMovimento } from "src/dominio/tipos.js";

export async function inserir(
  db: Db,
  dados: { insumoId: string; tipo: TipoMovimento; quantidade: number; origem?: OrigemMovimento },
) {
  const [criado] = await db
    .insert(historicoMovimento)
    .values({ ...dados, origem: dados.origem ?? "manual" })
    .returning();
  if (!criado) {
    throw new Error("Falha ao inserir movimento.");
  }
  return criado;
}

/**
 * Soma recebimento/vendas/desperdício de um insumo desde uma data (normalmente a data
 * da última contagem confirmada), usada como insumo para calcularValorEsperado.
 */
export async function somarDesde(db: Db, insumoId: string, desde: Date): Promise<MovimentosDesdeUltimaContagem> {
  const movimentos = await db
    .select()
    .from(historicoMovimento)
    .where(and(eq(historicoMovimento.insumoId, insumoId), gt(historicoMovimento.registradoEm, desde)));

  return movimentos.reduce<MovimentosDesdeUltimaContagem>(
    (totais, movimento) => {
      if (movimento.tipo === "recebimento") totais.recebimento += movimento.quantidade;
      if (movimento.tipo === "venda") totais.vendas += movimento.quantidade;
      if (movimento.tipo === "desperdicio") totais.desperdicio += movimento.quantidade;
      return totais;
    },
    { recebimento: 0, vendas: 0, desperdicio: 0 },
  );
}
