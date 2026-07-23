import type ExcelJS from "exceljs";
import { parseBrNumber } from "src/wasteXlsx/wasteReportSchema.js";

/**
 * Column headers confirmed against real XLSX exports (23/07) for both Completo and
 * Incompleto — same set, order may vary between exports so parsers map by name.
 */
export const WASTE_REPORT_HEADERS = [
  "Cód. Loja",
  "Loja",
  "SKU",
  "Produto",
  "Data",
  "Período",
  "Usuário",
  "Razão",
  "Qtd.",
  "Custo Unit.",
  "Valor Total",
  "Atualizado em",
  "Atualizado por",
  "Criado em",
  "Criado por",
] as const;

/** Columns the row parsers actually read (the rest are present but unused). */
export const WASTE_ROW_REQUIRED_HEADERS = [
  "SKU",
  "Produto",
  "Data",
  "Período",
  "Usuário",
  "Razão",
  "Qtd.",
  "Custo Unit.",
  "Valor Total",
] as const;

export type WasteRowHeader = (typeof WASTE_ROW_REQUIRED_HEADERS)[number];

const NO_DATA_MARKER = "Nenhum dado encontrado";
export const REPORT_SHEET_NAME = "Relatório";

/**
 * exceljs CellValue → plain string. Handles rich text / formula results; trims.
 * Returns null for blank cells.
 */
export function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return formatDdMmYyyy(value);
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      const joined = value.richText.map((part) => part.text).join("").trim();
      return joined === "" ? null : joined;
    }
    if ("text" in value && typeof value.text === "string") {
      const trimmed = value.text.trim();
      return trimmed === "" ? null : trimmed;
    }
    if ("result" in value) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
  }
  return null;
}

/**
 * exceljs CellValue → number. Accepts native Excel numbers, BR-formatted strings
 * ("0,02", "1.234,56"), and plain decimal strings. Throws on blank/unparseable.
 */
export function cellToNumber(value: ExcelJS.CellValue, fieldLabel: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellToNumber(value.result as ExcelJS.CellValue, fieldLabel);
  }
  const asString = cellToString(value);
  if (asString === null) {
    throw new Error(`Missing numeric value for ${fieldLabel}`);
  }
  if (asString.includes(",")) {
    return parseBrNumber(asString.replace(/^R\$\s*/i, "").trim());
  }
  const parsed = Number(asString.replace(/^R\$\s*/i, "").trim());
  if (Number.isNaN(parsed)) {
    throw new Error(`Not a valid number for ${fieldLabel}: "${asString}"`);
  }
  return parsed;
}

/**
 * exceljs CellValue → DD/MM/YYYY. Real exports store "Data" as an Excel serial
 * (e.g. 46225 → 22/07/2026); also accepts Date objects and already-formatted strings.
 */
export function cellToDateString(value: ExcelJS.CellValue, fieldLabel: string): string {
  if (value instanceof Date) {
    return formatDdMmYyyy(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatDdMmYyyy(excelSerialToUtcDate(value));
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellToDateString(value.result as ExcelJS.CellValue, fieldLabel);
  }
  const asString = cellToString(value);
  if (asString === null) {
    throw new Error(`Missing date value for ${fieldLabel}`);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(asString)) {
    return asString;
  }
  const asNumber = Number(asString);
  if (!Number.isNaN(asNumber)) {
    return formatDdMmYyyy(excelSerialToUtcDate(asNumber));
  }
  throw new Error(`Not a valid date for ${fieldLabel}: "${asString}"`);
}

/** Excel serial day count → UTC Date. Epoch is 1899-12-30 (Excel's 1900 date system). */
export function excelSerialToUtcDate(serial: number): Date {
  const wholeDays = Math.floor(serial);
  return new Date(Date.UTC(1899, 11, 30) + wholeDays * 86_400_000);
}

export function formatDdMmYyyy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * header row (cells) → Map<headerName, 1-based column index>. Throws if any required
 * data column is missing — better a loud error than silently skipping a reordered export.
 */
export function mapHeaderColumns(headerRow: ExcelJS.Row): Map<string, number> {
  const columns = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = cellToString(cell.value);
    if (name) {
      columns.set(name, colNumber);
    }
  });

  for (const required of WASTE_ROW_REQUIRED_HEADERS) {
    if (!columns.has(required)) {
      throw new Error(
        `Waste report header is missing required column "${required}" — unexpected format (got: ${[...columns.keys()].join(", ") || "(empty)"}).`,
      );
    }
  }
  return columns;
}

export function sheetContainsNoDataMarker(sheet: ExcelJS.Worksheet): boolean {
  let found = false;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellToString(cell.value);
      if (text?.includes(NO_DATA_MARKER)) {
        found = true;
      }
    });
  });
  return found;
}

export function readCell(
  row: ExcelJS.Row,
  columns: Map<string, number>,
  header: WasteRowHeader,
): ExcelJS.CellValue {
  const col = columns.get(header);
  if (col === undefined) {
    throw new Error(`Internal error: column "${header}" missing from header map`);
  }
  return row.getCell(col).value;
}
