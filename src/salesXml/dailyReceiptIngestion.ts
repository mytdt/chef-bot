import type { Db } from "src/persistence/db.js";
import * as processedReceiptFileRepo from "src/persistence/repositories/processedReceiptFileRepo.js";
import { findDailyReceiptFiles, type DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import { downloadFileContent, type DriveFileContentApi } from "src/salesXml/driveFileContent.js";
import { processNfeReceipt, type ProcessNfeReceiptResult } from "src/salesXml/receiptAdapter.js";

export interface ReceiptFileProcessingError {
  fileId: string;
  fileName: string;
  error: string;
}

export interface ReceiptFileProcessingSuccess {
  fileId: string;
  fileName: string;
  result: ProcessNfeReceiptResult;
}

export interface IngestDailyReceiptsResult {
  totalFilesFound: number;
  processed: ReceiptFileProcessingSuccess[];
  skippedAlreadyProcessed: { fileId: string; fileName: string }[];
  errors: ReceiptFileProcessingError[];
}

/**
 * B5: mirrors dailySalesIngestion.ts's ingestDailySales exactly (same manual-trigger
 * posture — D11 — same per-file error isolation, same identity-based idempotency), one
 * level down: receiving notes (NFe modelo 55) under `.../recebimentos/` instead of
 * sales NFC-e under `.../vendas/`. See ingestDailySales's comment for the full
 * reasoning behind each of these choices — not repeated here since it's identical.
 */
export async function ingestDailyReceipts(
  db: Db,
  files: DriveFilesApi & DriveFileContentApi,
  rootFolderId: string,
  storeId: string,
  date: Date,
): Promise<IngestDailyReceiptsResult> {
  const foundFiles = await findDailyReceiptFiles(files, rootFolderId, date);

  const result: IngestDailyReceiptsResult = {
    totalFilesFound: foundFiles.length,
    processed: [],
    skippedAlreadyProcessed: [],
    errors: [],
  };

  for (const file of foundFiles) {
    const alreadyProcessed = await processedReceiptFileRepo.isAlreadyProcessed(db, storeId, file.id);
    if (alreadyProcessed) {
      result.skippedAlreadyProcessed.push({ fileId: file.id, fileName: file.name });
      continue;
    }

    try {
      const xmlContent = await downloadFileContent(files, file.id);
      const receiptResult = await processNfeReceipt(db, storeId, xmlContent);
      await processedReceiptFileRepo.markProcessed(db, storeId, file.id);
      result.processed.push({ fileId: file.id, fileName: file.name, result: receiptResult });
    } catch (error) {
      result.errors.push({
        fileId: file.id,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
