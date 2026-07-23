import type { Db } from "src/persistence/db.js";
import * as processedReceiptFileRepo from "src/persistence/repositories/processedReceiptFileRepo.js";
import { findDailyReceiptFiles, type DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import { downloadBinaryFileContent, type DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import { processReceiptReport, type ProcessReceiptReportResult } from "src/receiptXlsx/receiptAdapter.js";

export interface ReceiptFileProcessingError {
  fileId: string;
  fileName: string;
  error: string;
}

export interface ReceiptFileProcessingSuccess {
  fileId: string;
  fileName: string;
  result: ProcessReceiptReportResult;
}

export interface IngestDailyReceiptsResult {
  totalFilesFound: number;
  processed: ReceiptFileProcessingSuccess[];
  skippedAlreadyProcessed: { fileId: string; fileName: string }[];
  errors: ReceiptFileProcessingError[];
}

/**
 * B5: ingests the daily supplier-notes XLSX under `.../recebimentos/` (replaces
 * individual NFe mod 55 XMLs). Same manual-trigger posture (D11), per-file error
 * isolation, and identity-based idempotency as dailySalesIngestion /
 * dailyWasteIngestion. Binary download — exceljs needs raw bytes, not UTF-8 text.
 */
export async function ingestDailyReceipts(
  db: Db,
  files: DriveFilesApi & DriveFileBinaryContentApi,
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
      const xlsxBuffer = await downloadBinaryFileContent(files, file.id);
      const receiptResult = await processReceiptReport(db, storeId, xlsxBuffer);
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
