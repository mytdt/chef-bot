/**
 * Deterministic alias normalization for count-message supply tokens (post-LLM,
 * pre-aggregation). The LLM may preserve tokens like "PCT CHICKEN" / "CHICKEN SESSÃO";
 * findByCode only knows canonical Supply.code values (CHICKEN, G, …).
 *
 * unitKind from the Zod parse is the primary package/unit signal; stripping PCT/CX
 * from the raw token here is belt-and-suspenders when the model still glues them on.
 */

const ACCENT_MARKS = /\p{M}/gu;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(ACCENT_MARKS, "");
}

/**
 * Maps a free-text supply token to the canonical Supply.code, or null if unrecognized.
 */
export function normalizeCountSupplyCode(supplyRaw: string): string | null {
  let token = stripDiacritics(supplyRaw.trim().toUpperCase());
  token = token.replace(/^(PCT|CX)\s+/, "").trim();
  // "CHICKEN SESSAO" (after diacritic strip) → CHICKEN — same supply, unit line.
  token = token.replace(/\s+SESSAO$/, "").trim();
  token = token.replace(/\s+/g, " ");

  const known = new Set(["G", "F", "W", "CHORI", "CHICKEN", "VEGETARIANO"]);
  if (known.has(token)) {
    return token;
  }
  return null;
}
