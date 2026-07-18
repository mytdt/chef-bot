import { valorEfetivo, type ContagemComOverride } from "src/calculo/esperado.js";

/**
 * Contagem às cegas: compara o valor efetivo informado pelo colaborador contra o
 * esperado por igualdade exata (sem margem de tolerância, decisão confirmada).
 * O valor_esperado nunca deve ser exposto ao colaborador em nenhuma mensagem —
 * essa é responsabilidade de quem chama esta função, não desta função em si.
 */
export function decidirBateuNaoBateu(contagemAtual: ContagemComOverride, valorEsperado: number): boolean {
  return valorEfetivo(contagemAtual) === valorEsperado;
}
