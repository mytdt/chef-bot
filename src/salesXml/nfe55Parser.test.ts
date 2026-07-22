import { describe, expect, it } from "vitest";
import { parseNfe55Xml } from "src/salesXml/nfe55Parser.js";

// Synthetic XML — same shape as a real NFe modelo 55 (recebimento) sample seen 22/07,
// not the real fiscal document itself (same rule as B1's synthetic NFC-e fixtures).
function nfe55Xml(opts: { mod?: string; natOp?: string; items: { cProd: string; xProd: string; qCom: string; uCom?: string }[] }): string {
  const mod = opts.mod ?? "55";
  const natOp = opts.natOp ?? "VENDA DE PRODUCAO DO ESTABELECIMENTO";
  const detBlocks = opts.items
    .map(
      (item, index) =>
        `<det nItem="${index + 1}"><prod><cProd>${item.cProd}</cProd><xProd>${item.xProd}</xProd><qCom>${item.qCom}</qCom><uCom>${item.uCom ?? "CX"}</uCom></prod></det>`,
    )
    .join("");
  return `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe0000000000"><ide><mod>${mod}</mod><natOp>${natOp}</natOp><dhEmi>2026-07-15T14:02:00-03:00</dhEmi></ide>${detBlocks}</infNFe></NFe></nfeProc>`;
}

describe("parseNfe55Xml", () => {
  it("parses ide fields and line items", () => {
    const xml = nfe55Xml({ items: [{ cProd: "052700.0160006", xProd: "HB S/TEMP 160G CX", qCom: "26.0000" }] });

    const parsed = parseNfe55Xml(xml);

    expect(parsed.nfeProc.NFe.infNFe.ide.mod).toBe("55");
    expect(parsed.nfeProc.NFe.infNFe.det).toHaveLength(1);
    expect(parsed.nfeProc.NFe.infNFe.det[0]?.prod.qCom).toBe(26);
  });

  it("preserves leading zeros in cProd (fast-xml-parser would otherwise coerce it to a number and lose them)", () => {
    const xml = nfe55Xml({ items: [{ cProd: "052700.0160006", xProd: "HB S/TEMP 160G CX", qCom: "1.0000" }] });

    const parsed = parseNfe55Xml(xml);

    expect(parsed.nfeProc.NFe.infNFe.det[0]?.prod.cProd).toBe("052700.0160006");
  });

  it("handles a single <det> the same as multiple (fast-xml-parser yields an object, not a 1-item array)", () => {
    const xml = nfe55Xml({ items: [{ cProd: "052100.0200007", xProd: "WAGYU CX", qCom: "3.0000" }] });

    const parsed = parseNfe55Xml(xml);

    expect(Array.isArray(parsed.nfeProc.NFe.infNFe.det)).toBe(true);
    expect(parsed.nfeProc.NFe.infNFe.det).toHaveLength(1);
  });

  it("throws on malformed/incomplete XML", () => {
    expect(() => parseNfe55Xml("<not-even-close-to-xml")).toThrow();
  });
});
