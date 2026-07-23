import type { Db } from "src/persistence/db.js";
import * as processedWasteFileRepo from "src/persistence/repositories/processedWasteFileRepo.js";
import { findDailyWasteFiles, type DriveFileRef, type DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import { downloadBinaryFileContent, type DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import { processWasteCompleteReport, type ProcessWasteCompleteResult } from "src/wasteXlsx/wasteCompleteAdapter.js";
import { processWasteIncompleteReport, type ProcessWasteIncompleteResult } from "src/wasteXlsx/wasteIncompleteAdapter.js";

export type WasteReportType = "complete" | "incomplete";

export interface WasteFileProcessingError {
  fileId: string;
  fileName: string;
  error: string;
}

export interface WasteFileProcessingSuccess {
  fileId: string;
  fileName: string;
  reportType: WasteReportType;
  result: ProcessWasteCompleteResult | ProcessWasteIncompleteResult;
}

export interface IngestDailyWasteResult {
  totalFilesFound: number;
  processed: WasteFileProcessingSuccess[];
  skippedAlreadyProcessed: { fileId: string; fileName: string }[];
  errors: WasteFileProcessingError[];
}

async function processOneWasteFile(
  db: Db,
  files: DriveFileBinaryContentApi,
  storeId: string,
  file: DriveFileRef,
  reportType: WasteReportType,
  result: IngestDailyWasteResult,
): Promise<void> {
  const alreadyProcessed = await processedWasteFileRepo.isAlreadyProcessed(db, storeId, file.id);
  if (alreadyProcessed) {
    result.skippedAlreadyProcessed.push({ fileId: file.id, fileName: file.name });
    return;
  }

  try {
    const xlsxBuffer = await downloadBinaryFileContent(files, file.id);
    const reportResult =
      reportType === "complete"
        ? await processWasteCompleteReport(db, storeId, xlsxBuffer)
        : await processWasteIncompleteReport(db, storeId, xlsxBuffer);
    await processedWasteFileRepo.markProcessed(db, storeId, file.id);
    result.processed.push({ fileId: file.id, fileName: file.name, reportType, result: reportResult });
  } catch (error) {
    result.errors.push({
      fileId: file.id,
      fileName: file.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function pushAmbiguityErrors(result: IngestDailyWasteResult, files: DriveFileRef[], reportTypeLabel: string): void {
  for (const file of files) {
    result.errors.push({
      fileId: file.id,
      fileName: file.name,
      error: `Mais de um arquivo "${reportTypeLabel}" encontrado para este dia (${files.length}) — ambíguo, precisa de revisão manual no Drive antes de processar.`,
    });
  }
}

/**
 * B6: ingests both daily waste-report XLSXs ("Completo" and "Incompleto"), same
 * manual-trigger posture (D11) and per-file error isolation as
 * dailySalesIngestion.ts/dailyReceiptIngestion.ts.
 *
 * Two things this function has that the other two don't, both because waste has two
 * report types sharing one folder instead of one document type per folder:
 * - Routes each file to the correct parser (processWasteCompleteReport vs.
 *   processWasteIncompleteReport) based on findDailyWasteFiles's classification —
 *   never guesses; a file findDailyWasteFiles couldn't classify becomes a per-file
 *   error (`unrecognized`, see below), not a silent skip or a crash.
 * - Guards against ambiguity: normally at most one "Completo" and one "Incompleto" file
 *   exist per day. If more than one of either is found, none of them are processed —
 *   each is reported as an error instead, so a human resolves it in Drive (deletes the
 *   duplicate, renames it) rather than the bot guessing which one is real or summing
 *   both and risking double-counted waste.
 *
 * Idempotency (processedWasteFileRepo) is by Drive file id, same table for both report
 * types — they're always different files with different ids, so no extra
 * discrimination is needed to keep them independent.
 */
export async function ingestDailyWaste(
  db: Db,
  files: DriveFilesApi & DriveFileBinaryContentApi,
  rootFolderId: string,
  storeId: string,
  date: Date,
): Promise<IngestDailyWasteResult> {
  const found = await findDailyWasteFiles(files, rootFolderId, date);

  const result: IngestDailyWasteResult = {
    totalFilesFound: found.complete.length + found.incomplete.length + found.unrecognized.length,
    processed: [],
    skippedAlreadyProcessed: [],
    errors: [],
  };

  for (const file of found.unrecognized) {
    result.errors.push({
      fileId: file.id,
      fileName: file.name,
      error: `Nome de arquivo não reconhecido como relatório de desperdício (esperado conter "Completo" ou "Incompleto"): ${file.name}`,
    });
  }

  if (found.complete.length > 1) {
    pushAmbiguityErrors(result, found.complete, "Completo");
  } else {
    for (const file of found.complete) {
      await processOneWasteFile(db, files, storeId, file, "complete", result);
    }
  }

  if (found.incomplete.length > 1) {
    pushAmbiguityErrors(result, found.incomplete, "Incompleto");
  } else {
    for (const file of found.incomplete) {
      await processOneWasteFile(db, files, storeId, file, "incomplete", result);
    }
  }

  return result;
}
