import ExcelJS from "exceljs";
import { WASTE_REPORT_HEADERS } from "src/wasteXlsx/xlsxCells.js";

export type WasteReportRowInput = {
  storeCode?: string;
  storeName?: string;
  sku: string;
  product: string;
  /** DD/MM/YYYY or Excel serial number */
  date: string | number;
  period: string;
  userId: string;
  reason: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  updatedAt?: string | number | null;
  updatedBy?: string | null;
  createdAt?: string | number | null;
  createdBy?: string | null;
};

/**
 * Builds a synthetic waste-report XLSX matching the real export shape (sheet
 * "Relatório" with header row + data, plus unused "Dados de Origem"). Used by unit
 * and integration tests — real samples stay local and are never committed.
 */
export async function buildWasteReportXlsx(rows: WasteReportRowInput[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const report = workbook.addWorksheet("Relatório");
  report.addRow([...WASTE_REPORT_HEADERS]);

  for (const row of rows) {
    report.addRow([
      row.storeCode ?? "0032",
      row.storeName ?? "0032 - Bom Beef Belem",
      row.sku,
      row.product,
      row.date,
      row.period,
      row.userId,
      row.reason,
      row.quantity,
      row.unitCost,
      row.totalValue,
      row.updatedAt ?? null,
      row.updatedBy ?? null,
      row.createdAt ?? null,
      row.createdBy ?? null,
    ]);
  }

  workbook.addWorksheet("Dados de Origem");
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Empty Completo-style sheet: title chrome + "Nenhum dado encontrado", no table header. */
export async function buildEmptyWasteReportXlsx(title = "Lista de Desperdício Completo"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const report = workbook.addWorksheet("Relatório");
  report.getCell("A1").value = title;
  report.getCell("A3").value = "FILTROS - Detalhado";
  report.getCell("A7").value = "Valor Total";
  report.getCell("B7").value = "Quantidade";
  report.getCell("A8").value = "R$ 0,00";
  report.getCell("B8").value = 0;
  report.getCell("A11").value = "Nenhum dado encontrado";

  const origin = workbook.addWorksheet("Dados de Origem");
  origin.getCell("A1").value = title;
  origin.getCell("A3").value = "Dados de Origem";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Workbook that is valid XLSX but missing the expected Relatório table entirely. */
export async function buildUnrecognizedWasteReportXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const report = workbook.addWorksheet("Relatório");
  report.getCell("A1").value = "something completely different";
  report.getCell("A2").value = "not a waste table";
  workbook.addWorksheet("Dados de Origem");
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
