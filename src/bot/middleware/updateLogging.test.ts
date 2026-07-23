import { describe, expect, it } from "vitest";
import { describeUpdate } from "src/bot/middleware/updateLogging.js";
import type { Context } from "telegraf";

function fakeCtx(partial: Record<string, unknown>): Context {
  return partial as unknown as Context;
}

describe("describeUpdate", () => {
  it("detects a bot_command update", () => {
    const described = describeUpdate(
      fakeCtx({
        chat: { id: -100123 },
        message: {
          text: "/ping",
          entities: [{ type: "bot_command", offset: 0, length: 5 }],
        },
      }),
    );
    expect(described).toEqual({
      chatId: "-100123",
      updateKind: "command",
      command: "/ping",
      textPreview: "/ping",
    });
  });

  it("detects free-text updates", () => {
    const described = describeUpdate(
      fakeCtx({
        chat: { id: 555 },
        message: { text: "857 G / 836 F" },
      }),
    );
    expect(described.updateKind).toBe("text");
    expect(described.command).toBeUndefined();
  });
});
