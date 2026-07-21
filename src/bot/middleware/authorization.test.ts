import { describe, expect, it, vi } from "vitest";
import type { Context } from "telegraf";
import { createAuthorizationMiddleware } from "src/bot/middleware/authorization.js";

function fakeCtx(chatId: number | undefined): Context {
  return { chat: chatId === undefined ? undefined : { id: chatId } } as unknown as Context;
}

describe("createAuthorizationMiddleware", () => {
  it("calls next() for a message from the configured group", async () => {
    const middleware = createAuthorizationMiddleware("-1001234567890");
    const next = vi.fn();

    await middleware(fakeCtx(-1001234567890), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("does not call next() for a message from a different chat", async () => {
    const middleware = createAuthorizationMiddleware("-1001234567890");
    const next = vi.fn();

    await middleware(fakeCtx(-1009999999999), next);

    expect(next).not.toHaveBeenCalled();
  });

  it("does not call next() when the update has no chat", async () => {
    const middleware = createAuthorizationMiddleware("-1001234567890");
    const next = vi.fn();

    await middleware(fakeCtx(undefined), next);

    expect(next).not.toHaveBeenCalled();
  });
});
