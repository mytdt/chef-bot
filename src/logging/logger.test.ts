import { describe, expect, it, vi, afterEach } from "vitest";
import { formatLogContext, formatLogLine, log } from "src/logging/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatLogLine", () => {
  it("matches the suggested timestamp/level/scope format", () => {
    const line = formatLogLine(
      "INFO",
      "ingest_xml",
      "sales result",
      { found: 3, durationMs: 40 },
      new Date("2026-07-23T23:45:00.000Z"),
    );
    expect(line).toBe(
      '[2026-07-23T23:45:00.000Z] [INFO] [ingest_xml] sales result {found: 3, durationMs: 40}',
    );
  });

  it("omits the context brace when context is empty", () => {
    expect(formatLogContext()).toBe("");
    expect(formatLogContext({})).toBe("");
  });
});

describe("log", () => {
  it("writes INFO to console.log and ERROR to console.error", () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    log.info("ping", "handler done", { durationMs: 2 });
    log.error("bot", "unhandled error", { chatId: "-100" });

    expect(infoSpy.mock.calls[0]?.[0]).toContain("[INFO] [ping] handler done");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ERROR] [bot] unhandled error");
  });
});
