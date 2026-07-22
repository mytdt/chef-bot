import { describe, expect, it } from "vitest";
import { parseWasteIncompleteReport } from "src/wastePdf/wasteIncompleteParser.js";

// Report boilerplate is generic (not customer data) — safe to reuse verbatim. Row
// content below is invented, not the real sample's waste data. Line-wrapping of
// multi-word cells (produto/razão split across lines) mirrors exactly what pdf-parse
// produced for the real sample (verified manually, 22/07) — this is the actual shape
// the parser has to handle, not a simplified stand-in.
const REPORT_HEADER = `Página 1 de 2
Lista de Desperdício Incompleto
FILTROS - DETALHADO
Data fiscal: 01/01/2026 até 01/01/2026
1 Loja(s) Selecionada(s)
VALOR TOTAL
R$ 42,00
QUANTIDADE
0
Nome Quantidade Total
Bom Beef Belem 0 R$ 42,00
0032 - Bom Beef Belem
SKU Produto Data Período Usuário Razão Qtd. Custo Unit. Valor Total Atualizado
em
Atualizado
por
`;

const PAGE_FOOTER = `
-- 1 of 2 --

Página 2 de 2
Dados de Origem
Titulo da chave Valor da chave
Loja 0032 - Bom Beef Belem
Datas selecionadas 01/01/2026 até 01/01/2026
Gerado em 01/01/2026 10:00:00

-- 2 of 2 --
`;

describe("parseWasteIncompleteReport", () => {
  it("parses two rows, including multi-word product/reason cells wrapped across lines", () => {
    const rows = `100
Molho
Especial 01/01/2026 Tarde 999
Validade
Vencida 1,50 R$ 12,00 R$ 18,00
200
Batata Frita
Congelada 01/01/2026 Manhã 111
Perda
Operacional 3,00 R$ 8,00 R$ 24,00`;
    const text = REPORT_HEADER + rows + PAGE_FOOTER;

    const result = parseWasteIncompleteReport(text);

    expect(result.hasData).toBe(true);
    expect(result.rows).toEqual([
      {
        sku: "100",
        product: "Molho Especial",
        date: "01/01/2026",
        period: "Tarde",
        userId: "999",
        reason: "Validade Vencida",
        quantity: 1.5,
        unitCost: 12,
        totalValue: 18,
      },
      {
        sku: "200",
        product: "Batata Frita Congelada",
        date: "01/01/2026",
        period: "Manhã",
        userId: "111",
        reason: "Perda Operacional",
        quantity: 3,
        unitCost: 8,
        totalValue: 24,
      },
    ]);
  });

  it("returns hasData: false without parsing rows when the report says 'Nenhum dado encontrado'", () => {
    const text = `Página 1 de 2\nLista de Desperdício Incompleto\nFILTROS - DETALHADO\nData fiscal: 01/01/2026 até 01/01/2026\n1 Loja(s) Selecionada(s)\nVALOR TOTAL\nR$ 0,00\nQUANTIDADE\n0\nNenhum dado encontrado\n\n-- 1 of 2 --\n`;

    const result = parseWasteIncompleteReport(text);

    expect(result).toEqual({ hasData: false, rows: [] });
  });

  it("throws when the table header can't be found (unexpected report format)", () => {
    expect(() => parseWasteIncompleteReport("something completely different")).toThrow(/table header/);
  });

  it("throws when the header is found but no row matches (format changed)", () => {
    const text = `${REPORT_HEADER}this is not a table row at all${PAGE_FOOTER}`;

    expect(() => parseWasteIncompleteReport(text)).toThrow(/no rows matched/);
  });
});
