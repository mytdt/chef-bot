import { describe, expect, it } from "vitest";
import { parseContagemSchema } from "src/bot/parse.schema.js";

describe("parseContagemSchema", () => {
  it("aceita um JSON válido com múltiplos itens, no formato real de contagem", () => {
    const resultado = parseContagemSchema.safeParse({
      itens: [
        { insumo: "G", quantidade: 742 },
        { insumo: "F", quantidade: 689 },
        { insumo: "W", quantidade: 380 },
        { insumo: "PCT CHICKEN", quantidade: 9, quantidadeReal: 8.5 },
      ],
    });

    expect(resultado.success).toBe(true);
  });

  it("aplica default null em quantidadeReal quando omitida", () => {
    const resultado = parseContagemSchema.parse({ itens: [{ insumo: "G", quantidade: 742 }] });
    expect(resultado.itens[0]?.quantidadeReal).toBeNull();
  });

  it("rejeita JSON sem o campo itens", () => {
    const resultado = parseContagemSchema.safeParse({});
    expect(resultado.success).toBe(false);
  });

  it("rejeita itens vazio", () => {
    const resultado = parseContagemSchema.safeParse({ itens: [] });
    expect(resultado.success).toBe(false);
  });

  it("rejeita item com quantidade não numérica", () => {
    const resultado = parseContagemSchema.safeParse({ itens: [{ insumo: "G", quantidade: "742" }] });
    expect(resultado.success).toBe(false);
  });

  it("rejeita item sem o campo insumo", () => {
    const resultado = parseContagemSchema.safeParse({ itens: [{ quantidade: 742 }] });
    expect(resultado.success).toBe(false);
  });

  it("rejeita insumo vazio", () => {
    const resultado = parseContagemSchema.safeParse({ itens: [{ insumo: "", quantidade: 742 }] });
    expect(resultado.success).toBe(false);
  });
});
