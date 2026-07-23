import type { AggregatedCountItem } from "src/bot/parse.schema.js";
import type { AggregateParsedCountResult, SkippedCountLine } from "src/domain/aggregateParsedCount.js";

/**
 * D1 confirmation text — option C1: both locations with conversion detail, then
 * aggregate totals used for comparison.
 */
export function formatCountConfirmationSummary(
  date: string,
  aggregation: AggregateParsedCountResult,
): string {
  const { items, skipped } = aggregation;

  const mezaninoBlock = items
    .map((item) => {
      const lines = item.locationBreakdown.mezanino.lines;
      if (lines.length === 0) return null;
      return formatLocationItem(item.supply, lines);
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  const cozinhaBlock = items
    .map((item) => {
      const lines = item.locationBreakdown.cozinha.lines;
      if (lines.length === 0) return null;
      return formatLocationItem(item.supply, lines);
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  const totals = items
    .map((item) => {
      const override =
        item.actualQuantity !== null ? ` (real informada / D5: ${item.actualQuantity})` : "";
      return `• ${item.supply}: ${item.quantity}${override}`;
    })
    .join("\n");

  return (
    `Entendi (${date}):\n\n` +
    `MEZANINO\n${mezaninoBlock || "(nenhum item)"}\n\n` +
    `COZINHA\n${cozinhaBlock || "(nenhum item)"}\n\n` +
    `TOTAIS (comparação)\n${totals || "(nenhum item)"}` +
    formatSkipped(skipped) +
    `\n\nConfirma?`
  );
}

function formatLocationItem(
  supply: string,
  lines: AggregatedCountItem["locationBreakdown"]["mezanino"]["lines"],
): string {
  const segments = lines.map((line) => {
    if (line.unitKind === "package") {
      return `${line.quantity} PCT → ${line.units} un`;
    }
    const isSessao = /sess[aã]o/i.test(line.supplyRaw);
    if (isSessao) {
      return `${line.quantity} sessão → ${line.units} un`;
    }
    return `${line.quantity} un`;
  });

  if (segments.length === 1) {
    return `• ${supply}: ${segments[0]}`;
  }
  const totalUnits = lines.reduce((sum, line) => sum + line.units, 0);
  return `• ${supply}: ${segments.join(" + ")} → ${totalUnits} un`;
}

function formatSkipped(skipped: SkippedCountLine[]): string {
  if (skipped.length === 0) {
    return "";
  }
  const lines = skipped.map((item) => {
    const reason =
      item.reason === "package_without_factor"
        ? "PCT/CX sem fator de conversão cadastrado"
        : "insumo não reconhecido";
    return `• ${item.location}: ${item.quantity} ${item.supplyRaw} (${reason})`;
  });
  return `\n\n⚠️ Ignorados:\n${lines.join("\n")}`;
}
