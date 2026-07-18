import { z } from "zod";

/**
 * One item of the count in free text, e.g., "742 G" -> { supply: "G", quantity: 742 }.
 * actualQuantity is only filled in when the employee reports the actual quantity of a
 * variable-quantity package in the message itself (D5) — null in the common case.
 */
export const countItemSchema = z.object({
  supply: z.string().min(1),
  quantity: z.number().finite(),
  actualQuantity: z.number().finite().nullable().default(null),
});

export const countParseSchema = z.object({
  items: z.array(countItemSchema).min(1),
});

export type CountItem = z.infer<typeof countItemSchema>;
export type ParsedCount = z.infer<typeof countParseSchema>;
