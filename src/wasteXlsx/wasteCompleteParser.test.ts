import { describe, expect, it } from "vitest";
import { parseWasteCompleteReport } from "src/wasteXlsx/wasteCompleteParser.js";
import {
  buildEmptyWasteReportXlsx,
  buildUnrecognizedWasteReportXlsx,
  buildWasteReportXlsx,
} from "src/wasteXlsx/wasteReportXlsxFixture.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const REAL_COMPLETE_PATH = join(homedir(), "Downloads", "Desperdicio_Completo.xlsx");

describe("parseWasteCompleteReport", () => {
  it("parses two rows (SKU = menu-item code) via the shared XLSX header contract", async () => {
    const buffer = await buildWasteReportXlsx([
      {
        sku: "1031",
        product: "X-Sabor",
        date: "01/01/2026",
        period: "Noite",
        userId: "999",
        reason: "Resolução de Problema",
        quantity: 1,
        unitCost: 15,
        totalValue: 15,
      },
      {
        sku: "2028",
        product: "Duplo Cheddar",
        date: "01/01/2026",
        period: "Manhã",
        userId: "111",
        reason: "Erro de Pedido",
        quantity: 1,
        unitCost: 15,
        totalValue: 15,
      },
    ]);

    const result = await parseWasteCompleteReport(buffer);

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

  it("returns hasData: false without parsing rows when the report says 'Nenhum dado encontrado'", async () => {
    const buffer = await buildEmptyWasteReportXlsx("Lista de Desperdício Completo");

    const result = await parseWasteCompleteReport(buffer);

    expect(result).toEqual({ hasData: false, rows: [] });
  });

  it("throws when the table header can't be found (unexpected report format / data we don't know how to interpret)", async () => {
    const buffer = await buildUnrecognizedWasteReportXlsx();

    await expect(parseWasteCompleteReport(buffer)).rejects.toThrow(/unexpected format/i);
  });

  it("throws when the header is found but there are no data rows", async () => {
    const buffer = await buildWasteReportXlsx([]);

    await expect(parseWasteCompleteReport(buffer)).rejects.toThrow(/no data rows/i);
  });

  it.runIf(existsSync(REAL_COMPLETE_PATH))(
    "recognizes the real local empty Desperdicio_Completo.xlsx sample (not committed)",
    async () => {
      const buffer = await readFile(REAL_COMPLETE_PATH);
      const result = await parseWasteCompleteReport(buffer);

      expect(result).toEqual({ hasData: false, rows: [] });
    },
  );
});
