import type Anthropic from "@anthropic-ai/sdk";
import { parseTextoContagem } from "src/llm/claudeClient.js";
import { parseContagemSchema, type ParseContagem } from "src/bot/parse.schema.js";

/**
 * Toda saída do LLM passa por aqui antes de tocar em lógica de negócio — se o JSON
 * vier malformado, falha explicitamente em vez de seguir com dados inválidos (D1
 * depende de o colaborador ver e confirmar exatamente o que foi parseado).
 */
export async function parseContagemTexto(client: Anthropic, textoBruto: string): Promise<ParseContagem> {
  const bruto = await parseTextoContagem(client, textoBruto);
  const resultado = parseContagemSchema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(`Parse do LLM não passou na validação Zod: ${resultado.error.message}`);
  }
  return resultado.data;
}
