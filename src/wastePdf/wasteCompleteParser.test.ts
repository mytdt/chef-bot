import { describe, expect, it } from "vitest";
import { parseWasteCompleteReport } from "src/wastePdf/wasteCompleteParser.js";

// Boilerplate is generic report chrome (not customer data). Row content below is
// invented, not the real sample's waste data — but the shape (including "Atualizado
// em/por" populated, and multi-word cells wrapped across lines) mirrors exactly what
// pdf-parse produced for a real populated sample (verified manually, 22/07).
const REPORT_HEADER = `Página 1 de 2
Lista de Desperdício Completo
FILTROS - DETALHADO
Data fiscal: 01/01/2026 até 01/01/2026
1 Loja(s) Selecionada(s)
VALOR TOTAL
R$ 30,00
QUANTIDADE
2
Nome Quantidade Total
Bom Beef Belem 2 R$ 30,00
0032 - Bom Beef Belem
Cód. Produto Data Período Usuário Razão Qtd Custo Custo Total Atualizado
em
Atualizado
por
`;

const PAGE_FOOTER = `
-- 1 of 2 --

Página 2 de 2
Dados de Origem
`;

describe("parseWasteCompleteReport", () => {
  it("parses two rows, including multi-word product/reason cells and populated 'Atualizado em/por'", () => {
    const rows = `1031 X-Sabor 01/01/2026 Noite 999
Resolução
de Problema 1,00 R$ 15,00 R$ 15,00
01/01/2026
20:00:00 999
2028
Duplo
Cheddar 01/01/2026 Manhã 111
Erro de
Pedido 1,00 R$ 15,00 R$ 15,00
01/01/2026
09:00:00 111`;
    const text = REPORT_HEADER + rows + PAGE_FOOTER;

    const result = parseWasteCompleteReport(text);

    expect(result.hasData).toBe(true);
    expect(result.rows).toEqual([
      {
        productCode: "1031",
        product: "X-Sabor",
        date: "01/01/2026",
        period: "Noite",
        userId: "999",
        reason: "Resolução de Problema",
        quantity: 1,
        unitCost: 15,
        totalCost: 15,
      },
      {
        productCode: "2028",
        product: "Duplo Cheddar",
        date: "01/01/2026",
        period: "Manhã",
        userId: "111",
        reason: "Erro de Pedido",
        quantity: 1,
        unitCost: 15,
        totalCost: 15,
      },
    ]);
  });

  it("returns hasData: false without parsing rows when the report says 'Nenhum dado encontrado'", () => {
    const text = `Página 1 de 2\nLista de Desperdício Completo\nFILTROS - DETALHADO\nVALOR TOTAL\nR$ 0,00\nQUANTIDADE\n0\nNenhum dado encontrado\n\n-- 1 of 2 --\n`;

    const result = parseWasteCompleteReport(text);

    expect(result).toEqual({ hasData: false, rows: [] });
  });

  it("throws when the table header can't be found (unexpected report format)", () => {
    expect(() => parseWasteCompleteReport("something completely different")).toThrow(/table header/);
  });

  it("throws when the header is found but no row matches (e.g. 'Atualizado em/por' missing, format changed)", () => {
    // Same row shape as "Incompleto" (no trailing "Atualizado em/por") — deliberately
    // must NOT match here, since this parser requires those fields (see ROW_PATTERN).
    const rows = `1031 X-Sabor 01/01/2026 Noite 999
Resolução
de Problema 1,00 R$ 15,00 R$ 15,00`;
    const text = REPORT_HEADER + rows + PAGE_FOOTER;

    expect(() => parseWasteCompleteReport(text)).toThrow(/no rows matched/);
  });
});
