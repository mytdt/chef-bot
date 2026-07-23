import { describe, expect, it } from "vitest";
import { formatConsolidatedAlertMessage, type CountMismatchAlertItem } from "src/bot/handlers/alert.js";

describe("formatConsolidatedAlertMessage", () => {
  it("builds one message with informed/expected/difference for 2+ mismatches", () => {
    const items: CountMismatchAlertItem[] = [
      {
        countId: "c1",
        supplyName: "Burger G",
        reportedValue: 50,
        expectedValue: 100,
        difference: -50,
      },
      {
        countId: "c2",
        supplyName: "Burger W",
        reportedValue: 12,
        expectedValue: 0,
        difference: 12,
      },
    ];

    const message = formatConsolidatedAlertMessage(items);

    expect(message).toContain("@all");
    expect(message).toContain("2 insumos");
    expect(message).toContain("• Burger G — informado: 50 | esperado: 100 | diferença: -50");
    expect(message).toContain("• Burger W — informado: 12 | esperado: 0 | diferença: +12");
    expect(message).toContain("recontagem");
    expect(message).toContain('Motivo: ..."');
    // Single consolidated message — not one header per item.
    expect(message.match(/@all/g)).toHaveLength(1);
  });

  it("uses singular wording for a single mismatch", () => {
    const message = formatConsolidatedAlertMessage([
      {
        countId: "c1",
        supplyName: "Burger F",
        reportedValue: 50,
        expectedValue: 0,
        difference: 50,
      },
    ]);

    expect(message).toContain("1 insumo");
    expect(message).not.toContain("insumos");
    expect(message).toContain("diferença: +50");
  });
});
