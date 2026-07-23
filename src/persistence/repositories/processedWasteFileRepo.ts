import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { processedWasteFile } from "src/persistence/schema.js";

export async function isAlreadyProcessed(db: Db, storeId: string, driveFileId: string): Promise<boolean> {
  const [found] = await db
    .select()
    .from(processedWasteFile)
    .where(and(eq(processedWasteFile.storeId, storeId), eq(processedWasteFile.driveFileId, driveFileId)))
    .limit(1);
  return Boolean(found);
}

export async function markProcessed(db: Db, storeId: string, driveFileId: string): Promise<void> {
  await db.insert(processedWasteFile).values({ storeId, driveFileId });
}
