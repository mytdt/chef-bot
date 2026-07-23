import { describe, expect, it } from "vitest";
import { parseReceiptReport } from "src/receiptXlsx/receiptParser.js";
import {
  buildReceiptReportXlsx,
  buildUnrecognizedReceiptReportXlsx,
} from "src/receiptXlsx/receiptReportXlsxFixture.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { excelSerialToUtcDate } from "src/wasteXlsx/xlsxCells.js";

// Real sample stays local (never committed) — same rule as B1/B6.
const REAL_RECEIPT_PATH = join(homedir(), "Downloads", "Notas_Fornecedores.xlsx");

describe("parseReceiptReport", () => {
  it("keeps only Situação=Aprovada + Tipo=Item and uses Qtd. Estoque (not Qtd. Recebida)", async () => {
    // Real-sample shape: SKU 512 has Qtd. Estoque=36 vs Qtd. Recebida=24 — must take 36.
    const buffer = await buildReceiptReportXlsx([
      {
        situation: "Aprovada",
        type: "Despesa",
        sku: null,
        name: "Frete",
        stockQuantity: null,
        receivedQuantity: null,
        receivedAt: 46225,
      },
      {
        situation: "Cancelada",
        type: "Item",
        sku: 201,
        name: "Pão Brioche",
        stockQuantity: 100,
        receivedQuantity: 100,
        receivedAt: 46225,
        unitStandard: "U",
      },
      {
        situation: "Aprovada",
        type: "Item",
        sku: 512,
        name: "Queijo Cheddar",
        stockQuantity: 36,
        receivedQuantity: 24,
        receivedAt: 46225,
        unitStandard: "U",
      },
    ]);

    const result = await parseReceiptReport(buffer);

    expect(result.hasData).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.sku).toBe(512);
    expect(result.rows[0]?.stockQuantity).toBe(36);
    expect(result.rows[0]?.receivedAt).toEqual(excelSerialToUtcDate(46225));
  });

  it("returns hasData=false when the sheet has only Despesa / non-Aprovada lines", async () => {
    const buffer = await buildReceiptReportXlsx([
      {
        situation: "Aprovada",
        type: "Despesa",
        sku: null,
        name: "Frete",
        stockQuantity: null,
        receivedAt: 46225,
      },
    ]);

    const result = await parseReceiptReport(buffer);

    expect(result.hasData).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("still parses when required columns are reordered", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Relatório");
    sheet.addRow(["Nome", "SKU", "Qtd. Estoque", "Recebido", "Situação", "Tipo"]);
    sheet.addRow(["Pão Brioche", 201, 12, 46225, "Aprovada", "Item"]);
    workbook.addWorksheet("Dados de Origem");
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await parseReceiptReport(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.sku).toBe(201);
    expect(result.rows[0]?.stockQuantity).toBe(12);
  });

  it("throws when the Relatório table headers are missing", async () => {
    const buffer = await buildUnrecognizedReceiptReportXlsx();
    await expect(parseReceiptReport(buffer)).rejects.toThrow(/missing required column/i);
  });

  it.runIf(existsSync(REAL_RECEIPT_PATH))(
    "parses the real local Notas_Fornecedores.xlsx sample (SKU 512 → Qtd. Estoque 36)",
    async () => {
      const buffer = await readFile(REAL_RECEIPT_PATH);
      const result = await parseReceiptReport(buffer);

      expect(result.hasData).toBe(true);
      const sku512 = result.rows.find((row) => row.sku === 512);
      expect(sku512).toBeDefined();
      expect(sku512?.stockQuantity).toBe(36);

      // Sample confirmed Un. Padrão ∈ {U, KG, null} only — document if that changes.
      for (const row of result.rows) {
        expect(row.stockQuantity).toBeGreaterThan(0);
        expect(Number.isFinite(row.stockQuantity)).toBe(true);
      }
    },
  );
});
