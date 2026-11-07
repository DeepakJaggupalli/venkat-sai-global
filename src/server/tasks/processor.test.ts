import { describe, expect, it } from "vitest";

// processor.ts imports the shared pool; creating a Pool does not connect, but it needs a URL.
process.env.DATABASE_URL ??= "postgres://unit:unit@127.0.0.1:1/unit_tests_no_connection";
const { computeRetryDelayMs, formatTaskError, TaskTimeoutError } = await import("./processor");

describe("computeRetryDelayMs", () => {
  it("grows exponentially from 30 s with equal jitter", () => {
    expect(computeRetryDelayMs(1, () => 0)).toBe(15_000);
    expect(computeRetryDelayMs(1, () => 1)).toBe(30_000);
    expect(computeRetryDelayMs(2, () => 0)).toBe(30_000);
    expect(computeRetryDelayMs(2, () => 1)).toBe(60_000);
    expect(computeRetryDelayMs(3, () => 1)).toBe(120_000);
    expect(computeRetryDelayMs(4, () => 0.5)).toBe(180_000);
  });

  it("caps the delay at one hour", () => {
    expect(computeRetryDelayMs(10, () => 1)).toBe(3_600_000);
    expect(computeRetryDelayMs(50, () => 1)).toBe(3_600_000);
    expect(computeRetryDelayMs(50, () => 0)).toBe(1_800_000);
  });

  it("always returns a value within [cap/2, cap]", () => {
    for (let attempt = 1; attempt <= 12; attempt++) {
      const cap = Math.min(3_600_000, 30_000 * 2 ** (attempt - 1));
      for (let i = 0; i < 20; i++) {
        const d = computeRetryDelayMs(attempt);
        expect(d).toBeGreaterThanOrEqual(cap / 2);
        expect(d).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe("formatTaskError", () => {
  it("keeps the error name, message and a short stack, bounded in length", () => {
    const text = formatTaskError(new TaskTimeoutError(1500));
    expect(text.startsWith("TaskTimeoutError: Task exceeded its 2s timeout")).toBe(true);
    expect(formatTaskError("plain")).toBe("plain");
    expect(formatTaskError(new Error("x".repeat(10_000))).length).toBeLessThanOrEqual(4000);
  });
});
