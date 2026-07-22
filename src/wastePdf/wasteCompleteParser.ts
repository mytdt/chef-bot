import { parseBrNumber, wasteCompleteRowSchema, type WasteCompleteReport } from "src/wastePdf/wasteReportSchema.js";

const NO_DATA_MARKER = "Nenhum dado encontrado";

// Different column set than "Incompleto" — "Cód." not "SKU", "Custo"/"Custo Total" not
// "Custo Unit."/"Valor Total" (confirmed against a real populated sample, 22/07).
const TABLE_HEADER_ANCHOR = "Custo Total Atualizado\nem\nAtualizado\npor";

const PAGE_BREAK_MARKER = /--\s*\d+\s*of\s*\d+\s*--/;

/**
 * One row's raw text looks like (pdf-parse wraps multi-word cells across lines; unlike
 * "Incompleto", "Atualizado em"/"Atualizado por" are populated here, not blank —
 * shape confirmed against a real populated sample, 22/07, values below are synthetic):
 *   1031 Product Name 18/07/2026 Noite 233
 *   Some
 *   Reason 1,00 R$ 20,01 R$ 20,01
 *   18/07/2026
 *   22:52:38 233
 * `produto` and `razão` are free text of unknown length, captured non-greedily up to
 * the next fixed-shape token. The trailing "Atualizado em/por" fields are required (not
 * optional) in this pattern — without them, a `g`-continued search after one row would
 * misread the next row's leading digits as stray content and desync the whole match
 * sequence.
 */
const ROW_PATTERN =
  /(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(\d+)\s+(.+?)\s+(\d+(?:\.\d+)*,\d+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+\d+/gs;

/**
 * Text extracted from a "Lista de Desperdício Completo" PDF (pdfText.ts) -> parsed
 * rows. Returns `{ hasData: false, rows: [] }` for an empty day ("Nenhum dado
 * encontrado"), same posture as B1-B3/wasteIncompleteParser.ts.
 *
 * Built against a real populated sample (22/07) — the only one available was
 * previously empty, so this used to be a stub that threw on any real data rather than
 * risk under-counting waste from a guessed format. Now grounded in an actual table.
 */
export function parseWasteCompleteReport(text: string): WasteCompleteReport {
  if (text.includes(NO_DATA_MARKER)) {
    return { hasData: false, rows: [] };
  }

  const headerIndex = text.indexOf(TABLE_HEADER_ANCHOR);
  if (headerIndex === -1) {
    throw new Error("Could not find the detail table header in the waste report text — unexpected format.");
  }
  const afterHeader = text.slice(headerIndex + TABLE_HEADER_ANCHOR.length);
  const pageBreakMatch = afterHeader.match(PAGE_BREAK_MARKER);
  const tableText = pageBreakMatch ? afterHeader.slice(0, pageBreakMatch.index) : afterHeader;

  const rows = [...tableText.matchAll(ROW_PATTERN)].map((match) => {
    const [, productCode, product, date, period, userId, reason, quantity, unitCost, totalCost] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return wasteCompleteRowSchema.parse({
      productCode,
      product: product.replace(/\s+/g, " ").trim(),
      date,
      period,
      userId,
      reason: reason.replace(/\s+/g, " ").trim(),
      quantity: parseBrNumber(quantity),
      unitCost: parseBrNumber(unitCost),
      totalCost: parseBrNumber(totalCost),
    });
  });

  if (rows.length === 0) {
    throw new Error(
      "Waste report ('Completo') table header was found but no rows matched — the report has data the parser doesn't recognize (format may have changed).",
    );
  }

  return { hasData: true, rows };
}
