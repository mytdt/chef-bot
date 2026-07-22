import { XMLParser } from "fast-xml-parser";
import { nfe55Schema, type ParsedNfe55 } from "src/salesXml/nfe55Schema.js";

// parseTagValue: false — unlike B1's sales cProd (plain numeric ids), this document
// type's cProd is a supplier SKU with leading zeros and dots as separators (e.g.
// "052700.0160006", confirmed against a real sample 22/07) — fast-xml-parser's default
// numeric auto-coercion mangles that into 52700.0160006, silently losing the leading
// zero and misreading the SKU. Keeping every value as a raw string sidesteps that;
// nfe55Schema already handles string inputs for both cProd (kept as string) and qCom
// (parsed with Number()).
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

/**
 * Raw NFe modelo 55 (recebimento) XML string -> validated structured data. Throws on
 * malformed XML or a shape that doesn't match nfe55Schema — same contract as
 * nfceParser.ts's parseNfceXml, so a future B5 ingestion loop can catch per-file the
 * same way B3/dailySalesIngestion.ts already does for sales.
 */
export function parseNfe55Xml(xmlContent: string): ParsedNfe55 {
  const raw: unknown = xmlParser.parse(xmlContent);
  return nfe55Schema.parse(raw);
}
