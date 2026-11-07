import { describe, expect, it } from "vitest";

import { RECURRING_TASKS } from "./schedule";
import { recurringDedupeKey, scheduleBucket } from "./scheduler";

describe("scheduleBucket", () => {
  it("groups epoch minutes into fixed intervals", () => {
    const t = new Date("2026-11-07T10:00:00Z");
    const minutes = Math.floor(t.getTime() / 60_000);
    expect(scheduleBucket(t, 1)).toBe(minutes);
    expect(scheduleBucket(t, 5)).toBe(Math.floor(minutes / 5));
    expect(scheduleBucket(t, 60)).toBe(Math.floor(minutes / 60));
  });

  it("stays the same within an interval and changes at its boundary", () => {
    const start = new Date("2026-11-07T10:05:00Z"); // epoch minutes divisible by 5
    expect(Math.floor(start.getTime() / 60_000) % 5).toBe(0);
    const b = scheduleBucket(start, 5);
    expect(scheduleBucket(new Date("2026-11-07T10:09:59.999Z"), 5)).toBe(b);
    expect(scheduleBucket(new Date("2026-11-07T10:10:00Z"), 5)).toBe(b + 1);
    expect(scheduleBucket(new Date("2026-11-07T10:04:59Z"), 5)).toBe(b - 1);
  });

  it("aligns daily buckets to UTC midnight", () => {
    expect(scheduleBucket(new Date("2026-11-07T00:00:00Z"), 1440)).toBe(scheduleBucket(new Date("2026-11-07T23:59:59Z"), 1440));
    expect(scheduleBucket(new Date("2026-11-08T00:00:00Z"), 1440)).toBe(scheduleBucket(new Date("2026-11-07T00:00:00Z"), 1440) + 1);
  });

  it("rejects invalid intervals", () => {
    expect(() => scheduleBucket(new Date(), 0)).toThrow();
    expect(() => scheduleBucket(new Date(), Number.NaN)).toThrow();
  });
});

describe("recurringDedupeKey", () => {
  it("is type:bucket, unique per interval", () => {
    const now = new Date("2026-11-07T10:07:00Z");
    expect(recurringDedupeKey({ type: "content.publish_scheduled", everyMinutes: 5 }, now)).toBe(`content.publish_scheduled:${scheduleBucket(now, 5)}`);
    expect(recurringDedupeKey({ type: "x", everyMinutes: 60 }, now)).not.toBe(recurringDedupeKey({ type: "x", everyMinutes: 60 }, new Date("2026-11-07T11:00:00Z")));
  });

  it("covers every configured recurring task with a positive interval", () => {
    const types = new Set<string>();
    for (const task of RECURRING_TASKS) {
      expect(task.everyMinutes).toBeGreaterThanOrEqual(1);
      expect(types.has(task.type)).toBe(false);
      types.add(task.type);
    }
  });
});
