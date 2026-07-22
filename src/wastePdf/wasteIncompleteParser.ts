import { parseBrNumber, wasteIncompleteRowSchema, type WasteIncompleteReport } from "src/wastePdf/wasteReportSchema.js";

const NO_DATA_MARKER = "Nenhum dado encontrado";

// Marks the end of the detail table's header row — the report tool wraps multi-word
// column headers across lines ("Atualizado em" / "Atualizado por"), so this anchor is
// the literal, fixed tail of the header rather than a single line.
const TABLE_HEADER_ANCHOR = "Valor Total Atualizado\nem\nAtualizado\npor";

// pdf-parse inserts this between pages ("-- 1 of 2 --") — used as the end boundary for
// the detail table, since page 2 is just "Dados de Origem" metadata we don't parse.
const PAGE_BREAK_MARKER = /--\s*\d+\s*of\s*\d+\s*--/;

/**
 * One row's raw text looks like (pdf-parse wraps multi-word cells across lines):
 *   508
 *   Queijo
 *   Gouda 21/07/2026 Manhã 233
 *   Perda
 *   Operacional 0,02 R$ 53,41 R$ 1,12
 * `produto` and `reason` are free text of unknown length, so they're captured
 * non-greedily up to the next fixed-shape token (a date, then a quantity number).
 */
const ROW_PATTERN =
  /(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(\d+)\s+(.+?)\s+(\d+(?:\.\d+)*,\d+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/gs;

/**
 * Text extracted from a "Lista de Desperdício Incompleto" PDF (pdfText.ts) -> parsed
 * rows. Returns `{ hasData: false, rows: [] }` for an empty day (the report says
 * "Nenhum dado encontrado") — same "no data isn't an error" posture as B1-B3.
 *
 * Confirmed via direct question (22/07): the header's "QUANTIDADE" field is not
 * reliable (always 0 in the sample seen) — the per-row "Qtd." column is the value that
 * matters, which is exactly what this parser extracts.
 */
export function parseWasteIncompleteReport(text: string): WasteIncompleteReport {
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
    const [, sku, product, date, period, userId, reason, quantity, unitCost, totalValue] = match as unknown as [
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
    return wasteIncompleteRowSchema.parse({
      sku,
      product: product.replace(/\s+/g, " ").trim(),
      date,
      period,
      userId,
      reason: reason.replace(/\s+/g, " ").trim(),
      quantity: parseBrNumber(quantity),
      unitCost: parseBrNumber(unitCost),
      totalValue: parseBrNumber(totalValue),
    });
  });

  if (rows.length === 0) {
    throw new Error(
      "Waste report table header was found but no rows matched — the report has data the parser doesn't recognize (format may have changed).",
    );
  }

  return { hasData: true, rows };
}
