import { describe, expect, it } from "vitest";
import { shouldEscalate, filterAlertsToEscalate } from "src/alerts/escalation.js";

const now = new Date("2026-07-17T12:00:00Z");
const minutesAgo = (min: number) => new Date(now.getTime() - min * 60 * 1000);

describe("shouldEscalate", () => {
  it("does not escalate before the timeout", () => {
    const alert = { id: "1", sentAt: minutesAgo(10), acknowledged: false, escalated: false };
    expect(shouldEscalate(alert, now, 15)).toBe(false);
  });

  it("escalates exactly at the timeout", () => {
    const alert = { id: "1", sentAt: minutesAgo(15), acknowledged: false, escalated: false };
    expect(shouldEscalate(alert, now, 15)).toBe(true);
  });

  it("escalates after the timeout", () => {
    const alert = { id: "1", sentAt: minutesAgo(20), acknowledged: false, escalated: false };
    expect(shouldEscalate(alert, now, 15)).toBe(true);
  });

  it("does not escalate if already acknowledged, even after the timeout", () => {
    const alert = { id: "1", sentAt: minutesAgo(30), acknowledged: true, escalated: false };
    expect(shouldEscalate(alert, now, 15)).toBe(false);
  });

  it("does not escalate again if already escalated", () => {
    const alert = { id: "1", sentAt: minutesAgo(30), acknowledged: false, escalated: true };
    expect(shouldEscalate(alert, now, 15)).toBe(false);
  });
});

describe("filterAlertsToEscalate", () => {
  it("returns only the eligible alerts, surviving a restart (decision derived only from sentAt)", () => {
    const alerts = [
      { id: "within-timeout", sentAt: minutesAgo(5), acknowledged: false, escalated: false },
      { id: "past-timeout", sentAt: minutesAgo(16), acknowledged: false, escalated: false },
      { id: "already-acknowledged", sentAt: minutesAgo(20), acknowledged: true, escalated: false },
    ];

    const result = filterAlertsToEscalate(alerts, now, 15);

    expect(result.map((a) => a.id)).toEqual(["past-timeout"]);
  });
});
