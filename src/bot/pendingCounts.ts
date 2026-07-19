import { randomUUID } from "node:crypto";
import type { ParsedCount } from "src/bot/parse.schema.js";

export interface PendingCount {
  chatId: number;
  collaboratorTelegramId: string;
  rawText: string;
  parse: ParsedCount;
}

// In-memory (not persisted) state of the parse awaiting collaborator confirmation (D1).
// Acceptable for a single-process MVP bot — if the process restarts, a pending
// confirmation is lost and the collaborator needs to resend the count.
const pending = new Map<string, PendingCount>();

export function storePending(data: PendingCount): string {
  const id = randomUUID();
  pending.set(id, data);
  return id;
}

export function consumePending(id: string): PendingCount | null {
  const data = pending.get(id);
  if (!data) return null;
  pending.delete(id);
  return data;
}
