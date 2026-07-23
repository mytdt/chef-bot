import type ExcelJS from "exceljs";
import { wasteCompleteRowSchema, type WasteCompleteReport } from "src/wasteXlsx/wasteReportSchema.js";
import { getReportSheet, loadWasteWorkbook } from "src/wasteXlsx/xlsxWorkbook.js";
import {
  cellToDateString,
  cellToNumber,
  cellToString,
  mapHeaderColumns,
  readCell,
  sheetContainsNoDataMarker,
} from "src/wasteXlsx/xlsxCells.js";

function parseDataRows(sheet: ExcelJS.Worksheet): WasteCompleteReport["rows"] {
  const headerRow = sheet.getRow(1);
  const columns = mapHeaderColumns(headerRow);
  const rows: WasteCompleteReport["rows"] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const productCode = cellToString(readCell(row, columns, "SKU"));
    if (productCode === null) {
      return;
    }

    rows.push(
      wasteCompleteRowSchema.parse({
        productCode,
        product: cellToString(readCell(row, columns, "Produto")) ?? "",
        date: cellToDateString(readCell(row, columns, "Data"), "Data"),
        period: cellToString(readCell(row, columns, "Período")) ?? "",
        userId: cellToString(readCell(row, columns, "Usuário")) ?? "",
        reason: cellToString(readCell(row, columns, "Razão")) ?? "",
        quantity: cellToNumber(readCell(row, columns, "Qtd."), "Qtd."),
        unitCost: cellToNumber(readCell(row, columns, "Custo Unit."), "Custo Unit."),
        totalCost: cellToNumber(readCell(row, columns, "Valor Total"), "Valor Total"),
      }),
    );
  });

  return rows;
}

/**
 * XLSX buffer from a "Lista de Desperdício Completo" export → parsed rows.
 * Returns `{ hasData: false, rows: [] }` for an empty day ("Nenhum dado encontrado").
 *
 * No populated Completo XLSX sample yet (23/07) — empty path is grounded in a real
 * file; populated path uses the same header contract as Incompleto + synthetic
 * fixtures. Anything that is neither empty nor a recognizable table header fails
 * loudly rather than risk under-counting waste from a guessed format.
 */
export async function parseWasteCompleteReport(xlsxBuffer: Buffer): Promise<WasteCompleteReport> {
  const workbook = await loadWasteWorkbook(xlsxBuffer);
  const sheet = getReportSheet(workbook);

  if (sheetContainsNoDataMarker(sheet)) {
    return { hasData: false, rows: [] };
  }

  let rows: WasteCompleteReport["rows"];
  try {
    rows = parseDataRows(sheet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse waste report ('Completo') table — unexpected format: ${message}`);
  }

  if (rows.length === 0) {
    throw new Error(
      "Waste report ('Completo') has no 'Nenhum dado encontrado' marker and no data rows — the report has content the parser doesn't recognize (format may have changed).",
    );
  }

  return { hasData: true, rows };
}
