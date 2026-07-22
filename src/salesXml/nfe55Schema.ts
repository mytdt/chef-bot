import { z } from "zod";

/**
 * B5: narrow schema for the fields this project reads from a supplier's receiving note
 * (NFe modelo 55 — distinct from the sales NFC-e, modelo 65, that B1/nfceSchema.ts
 * handles). Same parsing approach (fast-xml-parser, `{ ignoreAttributes: false,
 * removeNSPrefix: true }`), same string|number-union-then-transform pattern for
 * numeric-looking text nodes.
 *
 * `qCom`/`uCom` here are in the *purchasing* unit (boxes, "CX" in the one real sample
 * seen so far — 22/07), not the same unit collaborators count in. Converting box counts
 * to countable units is receiptAdapter.ts's job (via Supply.unitsPerBox), not this
 * schema's.
 */
const nfe55ProductSchema = z.object({
  cProd: z.union([z.string(), z.number()]).transform(String),
  xProd: z.string(),
  qCom: z.union([z.string(), z.number()]).transform(Number),
  uCom: z.string(),
});

const nfe55LineItemSchema = z.object({
  prod: nfe55ProductSchema,
});

// fast-xml-parser yields a single object (not an array) when there's exactly one <det>.
const nfe55LineItemsSchema = z
  .union([nfe55LineItemSchema, z.array(nfe55LineItemSchema)])
  .transform((det) => (Array.isArray(det) ? det : [det]));

const nfe55IdeSchema = z.object({
  // "55" identifies this as a full NFe (vs. "65" for NFC-e) — checked defensively in
  // receiptAdapter.ts rather than assumed, same spirit as B1's natOp check.
  mod: z.union([z.string(), z.number()]).transform(String),
  natOp: z.string(),
  dhEmi: z.string(),
});

export const nfe55Schema = z.object({
  nfeProc: z.object({
    NFe: z.object({
      infNFe: z.object({
        ide: nfe55IdeSchema,
        det: nfe55LineItemsSchema,
      }),
    }),
  }),
});

export type ParsedNfe55 = z.infer<typeof nfe55Schema>;
