import { z } from "zod";

/**
 * Um item da contagem em texto livre, ex.: "742 G" -> { insumo: "G", quantidade: 742 }.
 * quantidadeReal é preenchida apenas quando o colaborador informa a quantidade real de
 * um pacote de quantidade variável na própria mensagem (D5) — null no caso comum.
 */
export const itemContagemSchema = z.object({
  insumo: z.string().min(1),
  quantidade: z.number().finite(),
  quantidadeReal: z.number().finite().nullable().default(null),
});

export const parseContagemSchema = z.object({
  itens: z.array(itemContagemSchema).min(1),
});

export type ItemContagem = z.infer<typeof itemContagemSchema>;
export type ParseContagem = z.infer<typeof parseContagemSchema>;
