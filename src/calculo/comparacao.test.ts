import { describe, expect, it } from "vitest";
import { decidirBateuNaoBateu } from "src/calculo/comparacao.js";

describe("decidirBateuNaoBateu", () => {
  it("retorna true quando o valor informado é exatamente igual ao esperado", () => {
    const bateu = decidirBateuNaoBateu({ valorInformado: 380, quantidadeRealInformada: null }, 380);
    expect(bateu).toBe(true);
  });

  it("retorna false quando o valor informado difere do esperado, mesmo por pouco (sem margem de tolerância)", () => {
    const bateu = decidirBateuNaoBateu({ valorInformado: 379, quantidadeRealInformada: null }, 380);
    expect(bateu).toBe(false);
  });

  it("usa quantidade_real_informada (override D5) em vez de valor_informado na comparação", () => {
    const bateu = decidirBateuNaoBateu({ valorInformado: 9, quantidadeRealInformada: 7.5 }, 7.5);
    expect(bateu).toBe(true);
  });
});
