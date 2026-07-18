import type { Db } from "src/persistencia/db.js";
import type { ItemContagem } from "src/bot/parse.schema.js";
import * as insumoRepo from "src/persistencia/repositories/insumoRepo.js";
import * as contagemRepo from "src/persistencia/repositories/contagemRepo.js";
import * as historicoMovimentoRepo from "src/persistencia/repositories/historicoMovimentoRepo.js";
import { calcularValorEsperado } from "src/calculo/esperado.js";
import { decidirBateuNaoBateu } from "src/calculo/comparacao.js";

export interface ResultadoProcessamentoItem {
  insumoTextoOriginal: string;
  encontrado: boolean;
  insumoId?: string;
  insumoNome?: string;
  contagemId?: string;
  bateu?: boolean;
}

/**
 * Orquestra a criação de uma Contagem para um item já confirmado pelo colaborador (D1):
 * resolve o Insumo, busca a contagem anterior + movimentos desde então, calcula o
 * esperado, decide bate/não-bate e persiste um novo registro imutável.
 */
export async function processarItemContagem(
  db: Db,
  params: {
    lojaId: string;
    rotinaId: string;
    colaboradorTelegramId: string;
    textoBruto: string;
    item: ItemContagem;
  },
): Promise<ResultadoProcessamentoItem> {
  const { lojaId, rotinaId, colaboradorTelegramId, textoBruto, item } = params;

  const insumoEncontrado = await insumoRepo.buscarPorNome(db, lojaId, item.insumo);
  if (!insumoEncontrado) {
    return { insumoTextoOriginal: item.insumo, encontrado: false };
  }

  const contagemAnterior = await contagemRepo.buscarUltimaConfirmadaPorInsumo(db, insumoEncontrado.id);
  const desde = contagemAnterior?.criadoEm ?? new Date(0);
  const movimentos = await historicoMovimentoRepo.somarDesde(db, insumoEncontrado.id, desde);

  const valorEsperado = calcularValorEsperado(
    contagemAnterior
      ? {
          valorInformado: contagemAnterior.valorInformado,
          quantidadeRealInformada: contagemAnterior.quantidadeRealInformada,
        }
      : null,
    movimentos,
  );

  const bateu = decidirBateuNaoBateu(
    { valorInformado: item.quantidade, quantidadeRealInformada: item.quantidadeReal },
    valorEsperado,
  );

  const contagemCriada = await contagemRepo.inserir(db, {
    rotinaId,
    insumoId: insumoEncontrado.id,
    colaboradorTelegramId,
    textoBruto,
    valorInformado: item.quantidade,
    quantidadeRealInformada: item.quantidadeReal,
    valorEsperado,
    bateu,
    confirmadoPeloColaborador: true,
  });

  return {
    insumoTextoOriginal: item.insumo,
    encontrado: true,
    insumoId: insumoEncontrado.id,
    insumoNome: insumoEncontrado.nome,
    contagemId: contagemCriada.id,
    bateu,
  };
}
