import { z } from "zod";

// Brazilian number format: "." as thousands separator, "," as decimal separator (e.g.
// "1.234,56" or "0,02"). Strips the former, then swaps the latter for a plain float.
// Kept for string-typed XLSX cells; native Excel numbers go through cellToNumber instead.
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
 * see wasteCompleteParser.ts). Field names confirmed against real XLSX exports (23/07):
 * `Cód. Loja | Loja | SKU | Produto | Data | Período | Usuário | Razão | Qtd. |
 * Custo Unit. | Valor Total | Atualizado em | Atualizado por | Criado em | Criado por`
 * (store/audit columns aren't modeled here — nothing reads them).
 */
export const wasteIncompleteRowSchema = z.object({
  sku: z.string().min(1),
  product: z.string().min(1),
  date: z.string(), // DD/MM/YYYY after Excel-serial conversion
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
 * XLSX column set matches Incompleto (23/07) — "SKU" here is the menu-item code (same
 * code space as B1's sales NFC-e `cProd`), so wasteCompleteAdapter.ts reuses
 * `lookupProductMapping` instead of WASTE_SKU_MAP.
 *
 * No populated Completo XLSX sample yet — parser is grounded in the shared header
 * contract + synthetic fixtures; real empty sample only confirms the no-data path.
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
