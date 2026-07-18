import { randomUUID } from "node:crypto";
import type { ParseContagem } from "src/bot/parse.schema.js";

export interface ContagemPendente {
  chatId: number;
  colaboradorTelegramId: string;
  textoBruto: string;
  parse: ParseContagem;
}

// Estado em memória (não persistido) do parse aguardando confirmação do colaborador (D1).
// Aceitável para um bot de processo único do MVP — se o processo reiniciar, a confirmação
// pendente se perde e o colaborador precisa reenviar a contagem.
const pendentes = new Map<string, ContagemPendente>();

export function armazenarPendente(dados: ContagemPendente): string {
  const id = randomUUID();
  pendentes.set(id, dados);
  return id;
}

export function consumirPendente(id: string): ContagemPendente | null {
  const dados = pendentes.get(id);
  if (!dados) return null;
  pendentes.delete(id);
  return dados;
}
