import ExcelJS from "exceljs";

/** Full header row matching real "Notas_Fornecedores.xlsx" (order may vary at parse time). */
export const RECEIPT_REPORT_HEADERS = [
  "Cód. Loja",
  "Loja",
  "NF",
  "Data NF",
  "CNPJ",
  "Fornecedor",
  "Recebido",
  "Data/Hora Aprovação",
  "Usuário Aprovação",
  "Situação",
  "Origem",
  "Valor",
  "SKU",
  "Nome",
  "Descrição na Nota",
  "Código no fornecedor",
  "Tipo",
  "Qtd.",
  "Un. Padrão",
  "Qtd. Estoque",
  "Qtd. Recebida",
  "Devolução",
  "Valor Unit.",
  "Valor Total",
] as const;

export type ReceiptReportRowInput = {
  storeCode?: string;
  storeName?: string;
  nf?: string;
  /** Excel serial or Date — not used for attribution (parser uses Recebido). */
  invoiceDate?: number | Date | null;
  cnpj?: string;
  supplier?: string;
  /** Excel serial or Date — attribution date for the movement. */
  receivedAt: number | Date;
  situation?: string;
  type?: string;
  sku: number | null;
  name: string;
  descriptionOnInvoice?: string;
  supplierCode?: string;
  quantity?: number | null;
  unitStandard?: string | null;
  stockQuantity: number | null;
  receivedQuantity?: number | null;
};

/**
 * Builds a synthetic receipts XLSX matching the real export shape. Used by unit/
 * integration tests — the real sample stays local and is never committed.
 */
export async function buildReceiptReportXlsx(rows: ReceiptReportRowInput[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const report = workbook.addWorksheet("Relatório");
  report.addRow([...RECEIPT_REPORT_HEADERS]);

  for (const row of rows) {
    report.addRow([
      row.storeCode ?? "0032",
      row.storeName ?? "0032 - Bom Beef Belem",
      row.nf ?? "123456",
      row.invoiceDate ?? null,
      row.cnpj ?? "00.000.000/0001-00",
      row.supplier ?? "Fornecedor Teste",
      row.receivedAt,
      null,
      null,
      row.situation ?? "Aprovada",
      "Manual",
      0,
      row.sku,
      row.name,
      row.descriptionOnInvoice ?? row.name,
      row.supplierCode ?? null,
      row.type ?? "Item",
      row.quantity ?? row.receivedQuantity ?? null,
      row.unitStandard ?? "U",
      row.stockQuantity,
      row.receivedQuantity ?? null,
      0,
      0,
      0,
    ]);
  }

  workbook.addWorksheet("Dados de Origem");
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Valid XLSX with Relatório sheet but missing required table headers. */
export async function buildUnrecognizedReceiptReportXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const report = workbook.addWorksheet("Relatório");
  report.getCell("A1").value = "something completely different";
  report.getCell("A2").value = "not a receipt table";
  workbook.addWorksheet("Dados de Origem");
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
