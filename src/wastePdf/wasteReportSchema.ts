import { z } from "zod";

// Brazilian number format: "." as thousands separator, "," as decimal separator (e.g.
// "1.234,56" or "0,02"). Strips the former, then swaps the latter for a plain float.
export function parseBrNumber(raw: string): number {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Not a valid Brazilian-formatted number: "${raw}"`);
  }
  return value;
}

/**
 * B6: one row of the "Lista de Desperdício Incompleto" report — waste recorded
 * directly against an insumo/SKU (as opposed to "Completo", which is per menu item —
 * see wasteCompleteParser.ts). Field names/order confirmed against a real sample
 * (22/07): `SKU | Produto | Data | Período | Usuário | Razão | Qtd. | Custo Unit. |
 * Valor Total | Atualizado em | Atualizado por` (the last two were blank in the sample
 * and aren't modeled here — nothing reads them).
 */
export const wasteIncompleteRowSchema = z.object({
  sku: z.string().min(1),
  product: z.string().min(1),
  date: z.string(), // DD/MM/YYYY as it appears in the report
  period: z.string(),
  userId: z.string(),
  reason: z.string(),
  quantity: z.number(),
  unitCost: z.number(),
  totalValue: z.number(),
});

export type WasteIncompleteRow = z.infer<typeof wasteIncompleteRowSchema>;

export interface WasteIncompleteReport {
  hasData: boolean;
  rows: WasteIncompleteRow[];
}

/**
 * B6: one row of the "Lista de Desperdício Completo" report — waste recorded against
 * a whole menu item, not a raw insumo (see wasteIncompleteRowSchema above for that).
 * Field names/order confirmed against a real populated sample (22/07):
 * `Cód. | Produto | Data | Período | Usuário | Razão | Qtd | Custo | Custo Total |
 * Atualizado em | Atualizado por` — note this is a *different* column set than
 * "Incompleto" (e.g. "Cód." not "SKU", "Custo"/"Custo Total" not "Custo Unit."/"Valor
 * Total"), and "Atualizado em/por" were populated here (blank in the Incompleto
 * sample) — wasteCompleteParser.ts's regex requires them for that reason, unlike the
 * Incompleto parser.
 *
 * `productCode` (the "Cód." value, e.g. "1031") was confirmed against this sample to
 * be the *same code space* as B1's sales NFC-e `cProd` (both "1031" and "2028" from
 * this sample are real entries in salesXml/productMap.ts, mapping to sensible
 * insumos — Wagyu and G respectively) — so wasteCompleteAdapter.ts reuses
 * `lookupProductMapping` instead of a separate table.
 */
export const wasteCompleteRowSchema = z.object({
  productCode: z.string().min(1),
  product: z.string().min(1),
  date: z.string(),
  period: z.string(),
  userId: z.string(),
  reason: z.string(),
  quantity: z.number(),
  unitCost: z.number(),
  totalCost: z.number(),
});

export type WasteCompleteRow = z.infer<typeof wasteCompleteRowSchema>;

export interface WasteCompleteReport {
  hasData: boolean;
  rows: WasteCompleteRow[];
}
