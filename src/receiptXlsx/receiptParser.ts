import type ExcelJS from "exceljs";
import ExcelJSImport from "exceljs";
import { receiptReportRowSchema, type ReceiptReport } from "src/receiptXlsx/receiptReportSchema.js";
import {
  cellToNumber,
  cellToString,
  excelSerialToUtcDate,
  REPORT_SHEET_NAME,
  sheetContainsNoDataMarker,
} from "src/wasteXlsx/xlsxCells.js";

/** Headers we read for the movement (order may vary — mapped by name). */
const RECEIPT_REQUIRED_HEADERS = [
  "Situação",
  "Tipo",
  "SKU",
  "Nome",
  "Qtd. Estoque",
  "Recebido",
] as const;

type ReceiptHeader = (typeof RECEIPT_REQUIRED_HEADERS)[number];

function mapReceiptHeaderColumns(headerRow: ExcelJS.Row): Map<string, number> {
  const columns = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = cellToString(cell.value);
    if (name) {
      columns.set(name, colNumber);
    }
  });
  for (const required of RECEIPT_REQUIRED_HEADERS) {
    if (!columns.has(required)) {
      throw new Error(
        `Receipt report header is missing required column "${required}" — unexpected format (got: ${[...columns.keys()].join(", ") || "(empty)"}).`,
      );
    }
  }
  return columns;
}

function readNamedCell(row: ExcelJS.Row, columns: Map<string, number>, header: ReceiptHeader): ExcelJS.CellValue {
  const col = columns.get(header);
  if (col === undefined) {
    throw new Error(`Internal error: column "${header}" missing from header map`);
  }
  return row.getCell(col).value;
}

function cellToReceivedAt(value: ExcelJS.CellValue): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToUtcDate(value);
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellToReceivedAt(value.result as ExcelJS.CellValue);
  }
  const asString = cellToString(value);
  if (asString === null) {
    throw new Error('Missing date value for "Recebido"');
  }
  const asNumber = Number(asString);
  if (!Number.isNaN(asNumber)) {
    return excelSerialToUtcDate(asNumber);
  }
  throw new Error(`Not a valid "Recebido" date: "${asString}"`);
}

function cellToSku(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  // Blank string / whitespace-only cells come through cellToString as null.
  if (typeof value !== "number" && cellToString(value) === null) {
    return null;
  }
  const num = cellToNumber(value, "SKU");
  if (!Number.isInteger(num)) {
    throw new Error(`SKU must be an integer, got ${num}`);
  }
  return num;
}

/**
 * XLSX buffer ("Notas_Fornecedores") → filtered Item rows.
 * Keeps only Situação=Aprovada and Tipo=Item. "Un. Padrão" / "Qtd. Recebida" are not
 * used for quantity (back-office already converted into "Qtd. Estoque").
 */
export async function parseReceiptReport(xlsxBuffer: Buffer): Promise<ReceiptReport> {
  const workbook = new ExcelJSImport.Workbook();
  await workbook.xlsx.load(xlsxBuffer as unknown as ExcelJSImport.Buffer);
  const sheet = workbook.getWorksheet(REPORT_SHEET_NAME);
  if (!sheet) {
    const names = workbook.worksheets.map((ws) => ws.name).join(", ") || "(none)";
    throw new Error(`Receipt report is missing the "${REPORT_SHEET_NAME}" sheet — unexpected format (sheets: ${names}).`);
  }

  if (sheetContainsNoDataMarker(sheet)) {
    return { hasData: false, rows: [] };
  }

  const columns = mapReceiptHeaderColumns(sheet.getRow(1));
  const rows: ReceiptReport["rows"] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const situation = cellToString(readNamedCell(row, columns, "Situação"));
    const type = cellToString(readNamedCell(row, columns, "Tipo"));
    if (situation !== "Aprovada" || type !== "Item") {
      return;
    }

    const skuValue = readNamedCell(row, columns, "SKU");
    const sku = cellToSku(skuValue);
    if (sku === null) {
      // Tipo=Item should have SKU; blank SKU on an Item line is unexpected — skip loudly via throw
      throw new Error(`Receipt Item row ${rowNumber} has Situação=Aprovada but blank SKU — unexpected format.`);
    }

    rows.push(
      receiptReportRowSchema.parse({
        sku,
        name: cellToString(readNamedCell(row, columns, "Nome")) ?? "",
        stockQuantity: cellToNumber(readNamedCell(row, columns, "Qtd. Estoque"), "Qtd. Estoque"),
        receivedAt: cellToReceivedAt(readNamedCell(row, columns, "Recebido")),
        situation: "Aprovada",
        type: "Item",
      }),
    );
  });

  if (rows.length === 0) {
    // Valid file with only Despesa / non-Aprovada lines — treat as empty day, not an error.
    return { hasData: false, rows: [] };
  }

  return { hasData: true, rows };
}
