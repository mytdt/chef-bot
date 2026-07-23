import type ExcelJS from "exceljs";
import { wasteIncompleteRowSchema, type WasteIncompleteReport } from "src/wasteXlsx/wasteReportSchema.js";
import { getReportSheet, loadWasteWorkbook } from "src/wasteXlsx/xlsxWorkbook.js";
import {
  cellToDateString,
  cellToNumber,
  cellToString,
  mapHeaderColumns,
  readCell,
  sheetContainsNoDataMarker,
} from "src/wasteXlsx/xlsxCells.js";

function parseDataRows(sheet: ExcelJS.Worksheet): WasteIncompleteReport["rows"] {
  const headerRow = sheet.getRow(1);
  const columns = mapHeaderColumns(headerRow);
  const rows: WasteIncompleteReport["rows"] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const sku = cellToString(readCell(row, columns, "SKU"));
    // Trailing blank rows sometimes appear in exports — skip rows with no SKU rather
    // than treating them as format failures.
    if (sku === null) {
      return;
    }

    rows.push(
      wasteIncompleteRowSchema.parse({
        sku,
        product: cellToString(readCell(row, columns, "Produto")) ?? "",
        date: cellToDateString(readCell(row, columns, "Data"), "Data"),
        period: cellToString(readCell(row, columns, "Período")) ?? "",
        userId: cellToString(readCell(row, columns, "Usuário")) ?? "",
        reason: cellToString(readCell(row, columns, "Razão")) ?? "",
        quantity: cellToNumber(readCell(row, columns, "Qtd."), "Qtd."),
        unitCost: cellToNumber(readCell(row, columns, "Custo Unit."), "Custo Unit."),
        totalValue: cellToNumber(readCell(row, columns, "Valor Total"), "Valor Total"),
      }),
    );
  });

  return rows;
}

/**
 * XLSX buffer from a "Lista de Desperdício Incompleto" export → parsed rows.
 * Returns `{ hasData: false, rows: [] }` for an empty day ("Nenhum dado encontrado") —
 * same "no data isn't an error" posture as B1-B3.
 *
 * Reads cell-by-cell via header-name mapping (row 1), not fixed column indexes, so a
 * reordered export still parses. "Dados de Origem" sheet is ignored (metadata only).
 */
export async function parseWasteIncompleteReport(xlsxBuffer: Buffer): Promise<WasteIncompleteReport> {
  const workbook = await loadWasteWorkbook(xlsxBuffer);
  const sheet = getReportSheet(workbook);

  if (sheetContainsNoDataMarker(sheet)) {
    return { hasData: false, rows: [] };
  }

  let rows: WasteIncompleteReport["rows"];
  try {
    rows = parseDataRows(sheet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse waste report ('Incompleto') table — unexpected format: ${message}`);
  }

  if (rows.length === 0) {
    throw new Error(
      "Waste report ('Incompleto') has no 'Nenhum dado encontrado' marker and no data rows — the report has content the parser doesn't recognize (format may have changed).",
    );
  }

  return { hasData: true, rows };
}
