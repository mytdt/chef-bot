import { z } from "zod";

/**
 * Narrow schema for the fields this project actually reads from a parsed NFC-e
 * (Nota Fiscal de Consumidor eletrônica) document — not a full NFe schema. Extra
 * fields (tax breakdown, signature, emitter address, etc.) are ignored, not
 * validated, since B1 never touches them. Parsed with fast-xml-parser
 * ({ ignoreAttributes: false, removeNSPrefix: true }), which yields plain numbers
 * for numeric-looking text nodes — hence the string|number unions below.
 */
const nfceProductSchema = z.object({
  cProd: z.union([z.string(), z.number()]).transform(String),
  qCom: z.union([z.string(), z.number()]).transform(Number),
});

const nfceLineItemSchema = z.object({
  prod: nfceProductSchema,
});

// fast-xml-parser yields a single object (not an array) when there's exactly one <det>.
const nfceLineItemsSchema = z
  .union([nfceLineItemSchema, z.array(nfceLineItemSchema)])
  .transform((det) => (Array.isArray(det) ? det : [det]));

const nfceIdeSchema = z.object({
  natOp: z.string(),
  dhEmi: z.string(),
});

export const nfceSchema = z.object({
  nfeProc: z.object({
    NFe: z.object({
      infNFe: z.object({
        ide: nfceIdeSchema,
        det: nfceLineItemsSchema,
      }),
    }),
  }),
});

export type ParsedNfce = z.infer<typeof nfceSchema>;
