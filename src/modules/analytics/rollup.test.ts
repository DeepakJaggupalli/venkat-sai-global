import { describe, expect, it } from "vitest";

import { stepsReached, validateFunnelSteps } from "./funnel-rules";
import { aggregateDatesFor, sessionMetricRows } from "./rollup";
import { DEFAULT_FUNNEL_DEFINITIONS } from "./default-funnels";

describe("sessionMetricRows", () => {
  it("derives rates from additive metrics and keeps positive conversions", () => {
    const rows = sessionMetricRows(
      "2026-11-07",
      "device",
      "mobile",
      { sessions: 4, visitors: 3, newVisitors: 2, pageViews: 9, bounces: 1, totalDuration: 300 },
      { application_submitted: 2, contact_form_submitted: 0, "Bad Name": 3 },
    );
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      sessions: 4,
      visitors: 3,
      new_visitors: 2,
      page_views: 9,
      bounces: 1,
      bounce_rate: 0.25,
      total_duration: 300,
      avg_duration: 75,
      "conversions:application_submitted": 2,
    });
    expect(rows.every((r) => r.dimension === "device" && r.dimensionValue === "mobile" && r.date === "2026-11-07")).toBe(true);
  });

  it("never divides by zero", () => {
    const rows = sessionMetricRows("2026-11-07", "all", "", { sessions: 0, visitors: 0, newVisitors: 0, pageViews: 0, bounces: 0, totalDuration: 0 }, {});
    expect(rows.find((r) => r.metric === "bounce_rate")?.value).toBe(0);
    expect(rows.find((r) => r.metric === "avg_duration")?.value).toBe(0);
  });
});

describe("aggregateDatesFor", () => {
  const now = new Date("2026-11-07T20:00:00.000Z");
  it("recomputes yesterday and today in the reporting timezone", () => {
    expect(aggregateDatesFor({}, now, "Asia/Kolkata")).toEqual(["2026-11-07", "2026-11-08"]);
    expect(aggregateDatesFor({ scheduledFor: now.toISOString() }, now, "UTC")).toEqual(["2026-11-06", "2026-11-07"]);
  });
  it("accepts a validated backfill list", () => {
    expect(aggregateDatesFor({ dates: ["2026-10-02", "bad", "2026-10-01", "2026-10-02", 5] }, now, "UTC")).toEqual(["2026-10-01", "2026-10-02"]);
    const many = Array.from({ length: 90 }, (_, i) => `2026-08-${String((i % 28) + 1).padStart(2, "0")}`);
    expect(aggregateDatesFor({ dates: many }, now, "UTC").length).toBeLessThanOrEqual(62);
  });
});

describe("funnel rules", () => {
  it("validates step structure", () => {
    expect(validateFunnelSteps([{ label: "A", match: { event: "page_view" } }, { label: "B", match: { path: "/jobs/*" } }])).toBe(true);
    expect(validateFunnelSteps([{ label: "A", match: { event: "page_view" } }])).toBe(false);
    expect(validateFunnelSteps([{ label: "A", match: {} }, { label: "B", match: { event: "page_view" } }])).toBe(false);
    expect(validateFunnelSteps([{ label: "A", match: { path: "/x?y=1" } }, { label: "B", match: { event: "page_view" } }])).toBe(false);
    expect(validateFunnelSteps([{ label: "A", match: { event: "page_view", props: { a: { b: 1 } } } }, { label: "B", match: { event: "page_view" } }])).toBe(false);
    expect(validateFunnelSteps("nope")).toBe(false);
  });

  it("ships valid default funnels", () => {
    for (const funnel of DEFAULT_FUNNEL_DEFINITIONS) expect(validateFunnelSteps(funnel.steps)).toBe(true);
    expect(DEFAULT_FUNNEL_DEFINITIONS.map((f) => f.key)).toEqual(["employer_journey", "candidate_journey"]);
  });

  it("evaluates ordered steps within the window (reference implementation)", () => {
    const steps = [
      { label: "Jobs", match: { event: "page_view", path: "/jobs" } },
      { label: "Detail", match: { event: "page_view", path: "/jobs/*" } },
      { label: "Applied", match: { event: "application_submitted" } },
    ];
    const t = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
    const start = t(0);
    const end = t(24 * 3);
    // Out of order: applied before viewing details → only 2 steps.
    expect(
      stepsReached(
        [
          { name: "page_view", path: "/jobs", at: t(1) },
          { name: "application_submitted", path: "/talent", at: t(2) },
          { name: "page_view", path: "/jobs/welder", at: t(3) },
        ],
        steps,
        7,
        start,
        end,
      ),
    ).toBe(2);
    // Completion after the window → 2 steps.
    expect(
      stepsReached(
        [
          { name: "page_view", path: "/jobs", at: t(1) },
          { name: "page_view", path: "/jobs/welder", at: t(2) },
          { name: "application_submitted", path: "/talent", at: t(1 + 24 * 8) },
        ],
        steps,
        7,
        start,
        new Date(t(0).getTime() + 30 * 86_400_000),
      ),
    ).toBe(2);
    expect(stepsReached([{ name: "page_view", path: "/about", at: t(1) }], steps, 7, start, end)).toBe(0);
  });
});
