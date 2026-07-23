import { and, eq } from "drizzle-orm";
import type { Db } from "src/persistence/db.js";
import { processedReceiptFile } from "src/persistence/schema.js";

export async function isAlreadyProcessed(db: Db, storeId: string, driveFileId: string): Promise<boolean> {
  const [found] = await db
    .select()
    .from(processedReceiptFile)
    .where(and(eq(processedReceiptFile.storeId, storeId), eq(processedReceiptFile.driveFileId, driveFileId)))
    .limit(1);
  return Boolean(found);
}

export async function markProcessed(db: Db, storeId: string, driveFileId: string): Promise<void> {
  await db.insert(processedReceiptFile).values({ storeId, driveFileId });
}
