import type { Context, Telegraf } from "telegraf";
import type { Db } from "src/persistence/db.js";
import { createAdminMiddleware } from "src/bot/middleware/authorization.js";
import * as storeRepo from "src/persistence/repositories/storeRepo.js";
import * as dailyIngestionRunRepo from "src/persistence/repositories/dailyIngestionRunRepo.js";
import { ingestDailySales, type IngestDailySalesResult } from "src/salesXml/dailySalesIngestion.js";
import { ingestDailyReceipts, type IngestDailyReceiptsResult } from "src/salesXml/dailyReceiptIngestion.js";
import { ingestDailyWaste, type IngestDailyWasteResult } from "src/salesXml/dailyWasteIngestion.js";
import type { DriveFilesApi } from "src/salesXml/driveFileFinder.js";
import type { DriveFileContentApi, DriveFileBinaryContentApi } from "src/salesXml/driveFileContent.js";
import { resumeAwaitingCounts } from "src/domain/ingestionResume.js";
import { DATE_ONLY_PATTERN, parseDateOnly } from "src/domain/dateOnly.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatSalesSummary(result: IngestDailySalesResult): string[] {
  const lines = [
    `📦 Vendas — encontrados: ${result.totalFilesFound}, processados: ${result.processed.length}, já processados antes: ${result.skippedAlreadyProcessed.length}, erros: ${result.errors.length}`,
  ];
  for (const error of result.errors) {
    lines.push(`  ⚠️ ${error.fileName}: ${error.error}`);
  }
  return lines;
}

function formatReceiptsSummary(result: IngestDailyReceiptsResult): string[] {
  const lines = [
    `📥 Recebimento — encontrados: ${result.totalFilesFound}, processados: ${result.processed.length}, já processados antes: ${result.skippedAlreadyProcessed.length}, erros: ${result.errors.length}`,
  ];
  for (const error of result.errors) {
    lines.push(`  ⚠️ ${error.fileName}: ${error.error}`);
  }
  return lines;
}

function formatWasteSummary(result: IngestDailyWasteResult): string[] {
  const lines = [
    `🗑️ Desperdício — encontrados: ${result.totalFilesFound}, processados: ${result.processed.length}, já processados antes: ${result.skippedAlreadyProcessed.length}, erros: ${result.errors.length}`,
  ];
  for (const error of result.errors) {
    lines.push(`  ⚠️ ${error.fileName}: ${error.error}`);
  }
  return lines;
}

export interface IngestXmlHandlerDeps {
  adminTelegramIds: string[];
  driveFiles: DriveFilesApi & DriveFileContentApi & DriveFileBinaryContentApi;
  rootFolderId: string;
}

/**
 * B3/B5/B6 bot integration: manual trigger (D11 — no scheduler) for the daily
 * ingestion, restricted to admins. Runs all three ingestion types (venda, recebimento,
 * desperdício) for the given date in one execution — each is isolated in its own
 * try/catch so a Drive failure on one type doesn't block the other two, mirroring the
 * per-file error isolation each type already has internally.
 *
 * Each type's run is only recorded (dailyIngestionRunRepo.recordRun) if it completed
 * without throwing — even a run with per-file errors counts as "attempted" and is
 * recorded, same as the original sales-only behavior; only a hard Drive-access failure
 * skips recording. Once all three types are recorded for the date (whether from this
 * run or an earlier one), every count parked in "aguardando_ingestao" for that date is
 * resumed automatically (domain/ingestionResume.ts) — confirmed automatic-resume
 * behavior from the original B3 UX decision, now gated on all three types instead of
 * just sales.
 */
export function registerIngestXmlCommand(bot: Telegraf<Context>, db: Db, deps: IngestXmlHandlerDeps): void {
  bot.command("ingest-xml", createAdminMiddleware(deps.adminTelegramIds), async (ctx) => {
    const activeStore = await storeRepo.findActiveStore(db);
    if (!activeStore) {
      await ctx.reply("Nenhuma loja ativa configurada.");
      return;
    }

    const dateArg = ctx.message.text.trim().split(/\s+/)[1];
    if (dateArg && !DATE_ONLY_PATTERN.test(dateArg)) {
      await ctx.reply("Formato inválido. Use: /ingest-xml [AAAA-MM-DD] (sem data, usa hoje).");
      return;
    }
    const dateIso = dateArg ?? todayIso();
    const date = parseDateOnly(dateIso);

    await ctx.reply(`⏳ Ingerindo dados de ${dateIso} (venda, recebimento e desperdício)...`);

    const lines: string[] = [];

    try {
      const salesResult = await ingestDailySales(db, deps.driveFiles, deps.rootFolderId, activeStore.id, date);
      await dailyIngestionRunRepo.recordRun(db, activeStore.id, dateIso, "sale");
      lines.push(...formatSalesSummary(salesResult));
    } catch (error) {
      console.error("Failed to ingest daily sales XML:", error);
      lines.push("❌ Vendas: falha ao acessar o Google Drive — não registrado, tente novamente.");
    }

    try {
      const receiptsResult = await ingestDailyReceipts(db, deps.driveFiles, deps.rootFolderId, activeStore.id, date);
      await dailyIngestionRunRepo.recordRun(db, activeStore.id, dateIso, "receipt");
      lines.push(...formatReceiptsSummary(receiptsResult));
    } catch (error) {
      console.error("Failed to ingest daily receipt XML:", error);
      lines.push("❌ Recebimento: falha ao acessar o Google Drive — não registrado, tente novamente.");
    }

    try {
      const wasteResult = await ingestDailyWaste(db, deps.driveFiles, deps.rootFolderId, activeStore.id, date);
      await dailyIngestionRunRepo.recordRun(db, activeStore.id, dateIso, "waste");
      lines.push(...formatWasteSummary(wasteResult));
    } catch (error) {
      console.error("Failed to ingest daily waste PDFs:", error);
      lines.push("❌ Desperdício: falha ao acessar o Google Drive — não registrado, tente novamente.");
    }

    await ctx.reply(lines.join("\n"));

    const allTypesIngested = await dailyIngestionRunRepo.hasAllTypesRunForDate(db, activeStore.id, dateIso);
    if (allTypesIngested) {
      const resumedCount = await resumeAwaitingCounts(bot, db, activeStore.id, dateIso);
      if (resumedCount > 0) {
        await ctx.reply(`🔄 ${resumedCount} contagem(ns) pendente(s) processada(s) automaticamente.`);
      }
    }
  });
}
