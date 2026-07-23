import ExcelJS from "exceljs";
import { REPORT_SHEET_NAME } from "src/wasteXlsx/xlsxCells.js";

/**
 * B6: raw XLSX bytes → workbook. Both waste report types (Completo/Incompleto) share
 * the same export tool and sheet naming ("Relatório" + "Dados de Origem").
 */
export async function loadWasteWorkbook(xlsxBuffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings accept Buffer via ArrayBuffer-like; Node Buffer works at runtime.
  await workbook.xlsx.load(xlsxBuffer as unknown as ExcelJS.Buffer);
  return workbook;
}

export function getReportSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(REPORT_SHEET_NAME);
  if (!sheet) {
    const names = workbook.worksheets.map((ws) => ws.name).join(", ") || "(none)";
    throw new Error(`Waste report is missing the "${REPORT_SHEET_NAME}" sheet — unexpected format (sheets: ${names}).`);
  }
  return sheet;
}
