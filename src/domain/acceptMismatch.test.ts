import { describe, expect, it } from "vitest";
import { formatAcceptReply, type AcceptMismatchResult } from "src/domain/acceptMismatch.js";

describe("formatAcceptReply", () => {
  it("includes informed/expected/difference on success", () => {
    const result: AcceptMismatchResult = {
      ok: true,
      supplyCode: "F",
      supplyName: "Burger F",
      reportedValue: 99,
      expectedValue: 100,
      difference: -1,
    };
    const text = formatAcceptReply(result);
    expect(text).toContain("informado: 99");
    expect(text).toContain("esperado: 100");
    expect(text).toContain("diferença: -1");
  });

  it("reports nothing to accept", () => {
    expect(formatAcceptReply({ ok: false, reason: "nothing_to_accept", supplyToken: "F" })).toContain(
      "Nada para aceitar em F",
    );
  });

  it("reports already accepted", () => {
    expect(formatAcceptReply({ ok: false, reason: "already_accepted", supplyToken: "F" })).toContain(
      "já foi aceita",
    );
  });
});
