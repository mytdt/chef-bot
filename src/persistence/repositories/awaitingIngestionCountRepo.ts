import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import type { AggregatedCountItem } from "src/bot/parse.schema.js";
import type { LlmProvider } from "src/domain/types.js";
import { awaitingIngestionCount } from "src/persistence/schema.js";

export interface NewAwaitingIngestionCount {
  storeId: string;
  routineId: string;
  collaboratorTelegramId: string;
  confirmedByTelegramId: string;
  chatId: string;
  rawText: string;
  date: string;
  /** Post-conversion aggregates — same shape as Count insert / pending confirmation. */
  items: AggregatedCountItem[];
  llmUsed: LlmProvider;
}

export async function insert(db: Db, data: NewAwaitingIngestionCount) {
  const [created] = await db.insert(awaitingIngestionCount).values(data).returning();
  if (!created) {
    throw new Error("Failed to insert awaiting-ingestion count.");
  }
  return created;
}

export async function listByStoreAndDate(db: Db, storeId: string, date: string) {
  return db
    .select()
    .from(awaitingIngestionCount)
    .where(and(eq(awaitingIngestionCount.storeId, storeId), eq(awaitingIngestionCount.date, date)));
}

export async function deleteById(db: Db, id: string): Promise<void> {
  await db.delete(awaitingIngestionCount).where(eq(awaitingIngestionCount.id, id));
}
