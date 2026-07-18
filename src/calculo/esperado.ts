export interface ContagemComOverride {
  valorInformado: number;
  quantidadeRealInformada: number | null;
}

export interface MovimentosDesdeUltimaContagem {
  recebimento: number;
  vendas: number;
  desperdicio: number;
}

/**
 * D5: quando o colaborador informa a quantidade real ao abrir um pacote de
 * quantidade variável, esse valor pontual prevalece sobre o valor_informado
 * original — só para aquela contagem, sem alterar o padrão do Insumo.
 */
export function valorEfetivo(contagem: ContagemComOverride): number {
  return contagem.quantidadeRealInformada ?? contagem.valorInformado;
}

/**
 * Esperado = Recebimento + Contagem Anterior − Vendas − Desperdício.
 * Fórmula fixa validada em produção (planilha) — não alterar sem validação humana.
 */
export function calcularValorEsperado(
  contagemAnterior: ContagemComOverride | null,
  movimentos: MovimentosDesdeUltimaContagem,
): number {
  const baseAnterior = contagemAnterior ? valorEfetivo(contagemAnterior) : 0;
  return baseAnterior + movimentos.recebimento - movimentos.vendas - movimentos.desperdicio;
}
