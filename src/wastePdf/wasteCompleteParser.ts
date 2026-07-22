const NO_DATA_MARKER = "Nenhum dado encontrado";

export interface WasteCompleteReport {
  hasData: false;
}

/**
 * ⚠️ Deliberately incomplete (22/07): the only "Completo" sample available so far had
 * zero waste for the day ("Nenhum dado encontrado") — there's no real example of a
 * populated table to build row parsing against, unlike wasteIncompleteParser.ts, which
 * was written against an actual populated sample.
 *
 * This only recognizes the empty case. If the report ever has data, it throws instead
 * of silently returning nothing — under-counting waste would be worse than a loud
 * failure that tells whoever ran /ingest-xml (or equivalent) that this needs a real
 * developer to look at a populated sample before it can be parsed correctly. Do not
 * change this to "best guess" the row format — ask for a populated sample first.
 */
export function parseWasteCompleteReport(text: string): WasteCompleteReport {
  if (text.includes(NO_DATA_MARKER)) {
    return { hasData: false };
  }

  throw new Error(
    "Waste report ('Completo') has data, but row parsing for this report type isn't implemented yet — " +
      "only the empty case was ever seen in a real sample. Needs a populated sample to build against.",
  );
}
