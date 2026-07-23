import { z } from "zod";

/**
 * B5: one Item line from "Notas_Fornecedores.xlsx" after Situação/Tipo filters.
 * Quantity is always "Qtd. Estoque" (pre-converted by back-office) — never
 * "Qtd. Recebida" / "Un. Padrão" (purchase unit; ignored for the movement amount).
 */
export const receiptReportRowSchema = z.object({
  sku: z.number().int().positive(),
  name: z.string().min(1),
  stockQuantity: z.number().finite(),
  /** Physical arrival date from column "Recebido" (Excel serial → Date). */
  receivedAt: z.date(),
  situation: z.literal("Aprovada"),
  type: z.literal("Item"),
});

export type ReceiptReportRow = z.infer<typeof receiptReportRowSchema>;

export interface ReceiptReport {
  hasData: boolean;
  rows: ReceiptReportRow[];
}
