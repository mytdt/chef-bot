import { describe, expect, it } from "vitest";
import { parseWasteIncompleteReport } from "src/wasteXlsx/wasteIncompleteParser.js";
import {
  buildEmptyWasteReportXlsx,
  buildUnrecognizedWasteReportXlsx,
  buildWasteReportXlsx,
} from "src/wasteXlsx/wasteReportXlsxFixture.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Real sample stays local (never committed) — same rule as B1 fiscal XMLs / prior PDF
// samples. Path matches where Emanoel drops exports for local validation.
const REAL_INCOMPLETE_PATH = join(homedir(), "Downloads", "Desperdicio_Incompleto.xlsx");

describe("parseWasteIncompleteReport", () => {
  it("parses two rows via header-name mapping, including fractional Qtd.", async () => {
    const buffer = await buildWasteReportXlsx([
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

    const result = await parseWasteIncompleteReport(buffer);

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

  it("converts Excel serial dates to DD/MM/YYYY", async () => {
    // 46225 = 22/07/2026 in Excel's 1900 date system (confirmed against real sample).
    const buffer = await buildWasteReportXlsx([
      {
        sku: "605",
        product: "Batata Palito",
        date: 46225,
        period: "Noite",
        userId: "233",
        reason: "Perda Operacional",
        quantity: 0.05,
        unitCost: 21.4,
        totalValue: 1.01,
      },
    ]);

    const result = await parseWasteIncompleteReport(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.date).toBe("22/07/2026");
    expect(result.rows[0]?.quantity).toBeCloseTo(0.05);
  });

  it("still parses when required columns are reordered", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Relatório");
    // Deliberately different order than WASTE_REPORT_HEADERS — parser must map by name.
    sheet.addRow(["Produto", "SKU", "Qtd.", "Data", "Período", "Usuário", "Razão", "Custo Unit.", "Valor Total"]);
    sheet.addRow(["Queijo Gouda", "508", 0.02, "01/01/2026", "Manhã", "233", "Perda Operacional", 53.41, 1.12]);
    workbook.addWorksheet("Dados de Origem");
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await parseWasteIncompleteReport(buffer);

    expect(result.rows).toEqual([
      {
        sku: "508",
        product: "Queijo Gouda",
        date: "01/01/2026",
        period: "Manhã",
        userId: "233",
        reason: "Perda Operacional",
        quantity: 0.02,
        unitCost: 53.41,
        totalValue: 1.12,
      },
    ]);
  });

  it("returns hasData: false without parsing rows when the report says 'Nenhum dado encontrado'", async () => {
    const buffer = await buildEmptyWasteReportXlsx("Lista de Desperdício Incompleto");

    const result = await parseWasteIncompleteReport(buffer);

    expect(result).toEqual({ hasData: false, rows: [] });
  });

  it("throws when the table header can't be found (unexpected report format)", async () => {
    const buffer = await buildUnrecognizedWasteReportXlsx();

    await expect(parseWasteIncompleteReport(buffer)).rejects.toThrow(/unexpected format/i);
  });

  it("throws when the header is found but there are no data rows", async () => {
    const buffer = await buildWasteReportXlsx([]);

    await expect(parseWasteIncompleteReport(buffer)).rejects.toThrow(/no data rows/i);
  });

  it.runIf(existsSync(REAL_INCOMPLETE_PATH))(
    "parses the real local Desperdicio_Incompleto.xlsx sample (not committed)",
    async () => {
      const buffer = await readFile(REAL_INCOMPLETE_PATH);
      const result = await parseWasteIncompleteReport(buffer);

      expect(result.hasData).toBe(true);
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map((row) => row.sku)).toEqual(["201", "202", "605"]);
      expect(result.rows.map((row) => row.product)).toEqual(["Pão Smash Gergelim", "Pão Brioche", "Batata Palito"]);
      expect(result.rows.map((row) => row.quantity)).toEqual([1, 3, 0.05]);
      expect(result.rows.every((row) => row.date === "22/07/2026")).toBe(true);
      expect(result.rows.every((row) => row.period === "Noite")).toBe(true);
      expect(result.rows.every((row) => row.reason === "Perda Operacional")).toBe(true);
    },
  );
});
