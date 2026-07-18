import { describe, expect, it } from "vitest";
import { calcularValorEsperado, valorEfetivo } from "src/calculo/esperado.js";

describe("calcularValorEsperado", () => {
  it("calcula o esperado a partir da contagem anterior e dos movimentos (caso normal)", () => {
    const contagemAnterior = { valorInformado: 380, quantidadeRealInformada: null };
    const esperado = calcularValorEsperado(contagemAnterior, {
      recebimento: 500,
      vendas: 400,
      desperdicio: 10,
    });

    expect(esperado).toBe(380 + 500 - 400 - 10);
  });

  it("usa 0 como base quando não há contagem anterior (primeira contagem do insumo)", () => {
    const esperado = calcularValorEsperado(null, { recebimento: 100, vendas: 20, desperdicio: 5 });

    expect(esperado).toBe(75);
  });

  it("usa quantidade_real_informada da contagem anterior em vez de valor_informado (pacote de quantidade variável, D5)", () => {
    const contagemAnterior = { valorInformado: 12, quantidadeRealInformada: 9.5 };
    const esperado = calcularValorEsperado(contagemAnterior, {
      recebimento: 0,
      vendas: 2,
      desperdicio: 0,
    });

    expect(esperado).toBe(9.5 - 2);
  });
});

describe("valorEfetivo", () => {
  it("retorna valor_informado quando não há override", () => {
    expect(valorEfetivo({ valorInformado: 742, quantidadeRealInformada: null })).toBe(742);
  });

  it("retorna quantidade_real_informada quando presente, ignorando valor_informado", () => {
    expect(valorEfetivo({ valorInformado: 9, quantidadeRealInformada: 7.25 })).toBe(7.25);
  });
});
