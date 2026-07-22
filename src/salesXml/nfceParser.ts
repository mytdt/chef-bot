import { XMLParser } from "fast-xml-parser";
import { nfceSchema, type ParsedNfce } from "src/salesXml/nfceSchema.js";

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

/**
 * Raw NFC-e XML string -> validated structured data. Throws on malformed XML or a
 * shape that doesn't match nfceSchema — B3 (not in scope yet) is responsible for
 * catching this per-file and deciding how to handle a bad document without failing
 * the whole batch.
 */
export function parseNfceXml(xmlContent: string): ParsedNfce {
  const raw: unknown = xmlParser.parse(xmlContent);
  return nfceSchema.parse(raw);
}
