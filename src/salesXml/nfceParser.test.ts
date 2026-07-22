import { describe, expect, it } from "vitest";
import { parseNfceXml } from "src/salesXml/nfceParser.js";

// Synthetic fixture matching the real NFC-e shape (nfeProc > NFe > infNFe > ide/det) —
// not real customer data. Real sample XMLs are fiscal/sensitive and never committed
// (see bbb-protein-consumption's README for the same rule).
function nfceXml(opts: { natOp?: string; items: { cProd: string | number; qCom: string | number }[] }): string {
  const natOp = opts.natOp ?? "venda";
  const detBlocks = opts.items
    .map(
      (item, index) => `
    <det nItem="${index + 1}">
      <prod>
        <cProd>${item.cProd}</cProd>
        <qCom>${item.qCom}</qCom>
      </prod>
    </det>`,
    )
    .join("");

  return `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe0000000000">
      <ide>
        <natOp>${natOp}</natOp>
        <dhEmi>2026-07-18T18:16:38-03:00</dhEmi>
      </ide>
      ${detBlocks}
    </infNFe>
  </NFe>
</nfeProc>`;
}

describe("parseNfceXml", () => {
  it("parses natOp, dhEmi and multiple line items", () => {
    const xml = nfceXml({
      items: [
        { cProd: 1001, qCom: "1.0000" },
        { cProd: 1027, qCom: "2.0000" },
      ],
    });

    const parsed = parseNfceXml(xml);

    expect(parsed.nfeProc.NFe.infNFe.ide.natOp).toBe("venda");
    expect(parsed.nfeProc.NFe.infNFe.ide.dhEmi).toBe("2026-07-18T18:16:38-03:00");
    expect(parsed.nfeProc.NFe.infNFe.det).toEqual([
      { prod: { cProd: "1001", qCom: 1 } },
      { prod: { cProd: "1027", qCom: 2 } },
    ]);
  });

  it("normalizes a single <det> (parsed as an object, not an array) into an array", () => {
    const xml = nfceXml({ items: [{ cProd: 605, qCom: "1.0000" }] });

    const parsed = parseNfceXml(xml);

    expect(parsed.nfeProc.NFe.infNFe.det).toHaveLength(1);
    expect(parsed.nfeProc.NFe.infNFe.det[0]?.prod.cProd).toBe("605");
  });

  it("throws on XML missing the fields this project reads", () => {
    const xmlMissingIde = `<nfeProc><NFe><infNFe><det><prod><cProd>1001</cProd><qCom>1</qCom></prod></det></infNFe></NFe></nfeProc>`;

    expect(() => parseNfceXml(xmlMissingIde)).toThrow();
  });

  it("throws on malformed XML", () => {
    expect(() => parseNfceXml("<nfeProc><NFe>")).toThrow();
  });
});
