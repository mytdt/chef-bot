import { describe, expect, it } from "vitest";
import { countParseSchema } from "src/bot/parse.schema.js";

describe("countParseSchema", () => {
  it("accepts a valid JSON with multiple items, in the real count format", () => {
    const result = countParseSchema.safeParse({
      items: [
        { supply: "G", quantity: 742 },
        { supply: "F", quantity: 689 },
        { supply: "W", quantity: 380 },
        { supply: "PCT CHICKEN", quantity: 9, actualQuantity: 8.5 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("defaults actualQuantity to null when omitted", () => {
    const result = countParseSchema.parse({ items: [{ supply: "G", quantity: 742 }] });
    expect(result.items[0]?.actualQuantity).toBeNull();
  });

  it("rejects JSON without the items field", () => {
    const result = countParseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty items array", () => {
    const result = countParseSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an item with a non-numeric quantity", () => {
    const result = countParseSchema.safeParse({ items: [{ supply: "G", quantity: "742" }] });
    expect(result.success).toBe(false);
  });

  it("rejects an item without the supply field", () => {
    const result = countParseSchema.safeParse({ items: [{ quantity: 742 }] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty supply string", () => {
    const result = countParseSchema.safeParse({ items: [{ supply: "", quantity: 742 }] });
    expect(result.success).toBe(false);
  });
});
