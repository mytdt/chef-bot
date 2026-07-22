import type { Db } from "src/persistence/db.js";
import * as processedSalesFileRepo from "src/persistence/repositories/processedSalesFileRepo.js";
import { findDailyNfceFiles, type DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import { downloadFileContent, type DriveFileContentApi } from "src/salesXml/driveFileContent.js";
import { processNfceSale, type ProcessNfceSaleResult } from "src/salesXml/salesAdapter.js";

export interface FileProcessingError {
  fileId: string;
  fileName: string;
  error: string;
}

export interface FileProcessingSuccess {
  fileId: string;
  fileName: string;
  result: ProcessNfceSaleResult;
}

export interface IngestDailySalesResult {
  totalFilesFound: number;
  processed: FileProcessingSuccess[];
  skippedAlreadyProcessed: { fileId: string; fileName: string }[];
  errors: FileProcessingError[];
}

/**
 * B3: manual-trigger entry point (D11 — no scheduler, no automatic retry) that ingests
 * one day's NFC-e sales for a store.
 *
 * - Missing folder/no files yet -> empty result, not an error (findDailyNfceFiles
 *   already returns [] rather than throwing; this function just doesn't loop).
 * - Malformed XML or any other per-file failure -> caught and recorded in `errors`,
 *   the rest of the batch keeps going. One bad file must never block the others.
 * - Re-running for a day already ingested -> idempotent: files already recorded in
 *   `processed_sales_file` (by Drive file id, not by content) are skipped, not
 *   reprocessed, so InventoryMovement never gets duplicated. Files that failed on a
 *   previous run are NOT marked processed, so a re-run naturally retries just those.
 */
export async function ingestDailySales(
  db: Db,
  files: DriveFilesApi & DriveFileContentApi,
  rootFolderId: string,
  storeId: string,
  date: Date,
): Promise<IngestDailySalesResult> {
  const foundFiles = await findDailyNfceFiles(files, rootFolderId, date);

  const result: IngestDailySalesResult = {
    totalFilesFound: foundFiles.length,
    processed: [],
    skippedAlreadyProcessed: [],
    errors: [],
  };

  for (const file of foundFiles) {
    const alreadyProcessed = await processedSalesFileRepo.isAlreadyProcessed(db, storeId, file.id);
    if (alreadyProcessed) {
      result.skippedAlreadyProcessed.push({ fileId: file.id, fileName: file.name });
      continue;
    }

    try {
      const xmlContent = await downloadFileContent(files, file.id);
      const saleResult = await processNfceSale(db, storeId, xmlContent);
      await processedSalesFileRepo.markProcessed(db, storeId, file.id);
      result.processed.push({ fileId: file.id, fileName: file.name, result: saleResult });
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
