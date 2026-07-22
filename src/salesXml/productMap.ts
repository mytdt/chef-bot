/**
 * Maps NFC-e product codes (prod.cProd) to the Supply.code values used in this
 * project's free-text counting flow, plus how many units of that supply one sale of
 * the product consumes.
 *
 * Ported from `bbb-protein-consumption/analyze-nfce.mjs` (companion tool, same team,
 * author Thieres Tembra) — reuse authorized by Emanoel (2026-07-21). That tool's
 * `type` labels (F, G, Wagyu, Chori, Chicken, Vegetariano) are translated here to this
 * project's Supply.code values (F, G, W, CHORI, CHICKEN, VEGETARIANO) — see
 * src/persistence/seed.ts for where those codes are seeded. Do not hand-maintain a
 * second copy of this table (ver B0.1 no TRILHA-ENTREGAVEIS.md) — if the source tool's
 * mapping changes, re-port it here.
 */

export type SalesSupplyCode = "F" | "G" | "W" | "CHORI" | "CHICKEN" | "VEGETARIANO";

export interface ProductMapping {
  supplyCode: SalesSupplyCode;
  multiplier: number;
}

const PRODUCT_MAP = new Map<string, ProductMapping>();

function addMapping(codes: (number | string)[], supplyCode: SalesSupplyCode, multiplier: number): void {
  for (const code of codes) {
    PRODUCT_MAP.set(String(code), { supplyCode, multiplier });
  }
}

addMapping([1015, 1029, 1115, 1129, 41015, 41029, 61115, 61129], "CHICKEN", 1);

addMapping(
  [
    1001, 1002, 1003, 1008, 1014, 1023, 1025, 1026, 1101, 1102, 1103, 1114, 1123, 1125, 1126, 2019, 40000, 41001,
    41002, 41003, 41014, 41023, 41025, 41026, 41102, 41103, 41114, 42019, 605, 61001, 61002, 61003, 61014, 61123,
    61125, 61126, 99998,
  ],
  "F",
  1,
);

addMapping(
  [
    1027, 1028, 1030, 1127, 1128, 1130, 2001, 2002, 2003, 2005, 2008, 2028, 2041, 2101, 2102, 2103, 2105, 2108, 2128,
    2129, 2141, 41027, 41028, 41030, 42001, 42002, 42003, 42005, 42008, 42028, 42041, 42102, 42103, 42108, 606, 6005,
    61127, 61128, 61130, 62001, 62002, 62003, 62005, 62008, 62141, 62128, 62129,
  ],
  "G",
  1,
);

addMapping([1022, 1024, 1032, 1122, 1124, 1132, 41022, 41024, 41032, 61122, 61124, 61132], "CHORI", 1);

addMapping([2024, 2124, 42024, 62124], "VEGETARIANO", 1);

// "Wagyu" in the source tool's labels -> "W" in this project's Supply.code.
addMapping(
  [1031, 1131, 2034, 2035, 2036, 2037, 2134, 2135, 2137, 41031, 42034, 42035, 42036, 42037, 61131, 62134, 62135, 62137],
  "W",
  1,
);

addMapping([1005, 1105, 111111, 41005, 61005], "F", 2);
addMapping([2007, 2040, 2107, 2140, 222222, 42007, 42040, 62007, 62140], "G", 2);

export function lookupProductMapping(productCode: string): ProductMapping | null {
  return PRODUCT_MAP.get(productCode) ?? null;
}
