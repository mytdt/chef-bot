import { describe, expect, it } from "vitest";
import { parseWasteCompleteReport } from "src/wastePdf/wasteCompleteParser.js";

describe("parseWasteCompleteReport", () => {
  it("returns hasData: false when the report says 'Nenhum dado encontrado'", () => {
    const text = `Página 1 de 2\nLista de Desperdício Completo\nFILTROS - DETALHADO\nData fiscal: 01/01/2026 até 01/01/2026\n1 Loja(s) Selecionada(s)\nVALOR TOTAL\nR$ 0,00\nQUANTIDADE\n0\nNenhum dado encontrado\n\n-- 1 of 2 --\n`;

    expect(parseWasteCompleteReport(text)).toEqual({ hasData: false });
  });

  // Deliberate: row parsing for a populated "Completo" report isn't implemented — no
  // real sample with data has been seen yet (see wasteCompleteParser.ts). This must
  // fail loudly, not silently under-count waste.
  it("throws instead of silently ignoring data it can't parse", () => {
    const text = `Página 1 de 2\nLista de Desperdício Completo\nFILTROS - DETALHADO\nVALOR TOTAL\nR$ 55,00\nQUANTIDADE\n3\nSome table this parser doesn't understand yet`;

    expect(() => parseWasteCompleteReport(text)).toThrow(/isn't implemented yet/);
  });
});
