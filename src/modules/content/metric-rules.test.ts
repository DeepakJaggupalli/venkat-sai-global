import { describe, expect, it } from "vitest";

import { displayableMetric, manualApprovalIsCurrent, type MetricRowForDisplay } from "./metric-rules";

const LIVE_KEYS = new Set(["registered_candidates", "jobs_facilitated"]);
const computedAt = new Date("2026-11-07T08:00:00Z");

const row = (patch: Partial<MetricRowForDisplay> = {}): MetricRowForDisplay => ({
  key: "jobs_facilitated",
  label: "Jobs facilitated",
  mode: "live",
  isVisible: true,
  definition: "Job listings published on the platform.",
  liveQueryKey: "jobs_facilitated",
  manualValue: null,
  asOfDate: null,
  approvedValue: null,
  approvedAsOfDate: null,
  approvedAt: null,
  evidenceNote: null,
  evidenceFileId: null,
  minDisplayValue: null,
  ...patch,
});

const approvedManual = (patch: Partial<MetricRowForDisplay> = {}): MetricRowForDisplay =>
  row({
    key: "custom_trained_welders",
    label: "Welders trained",
    mode: "manual",
    liveQueryKey: null,
    manualValue: 120,
    asOfDate: "2026-10-31",
    approvedValue: 120,
    approvedAsOfDate: "2026-10-31",
    approvedAt: computedAt,
    evidenceNote: "Batch registers 2024–2026",
    ...patch,
  });

describe("public metric display rules", () => {
  it("shows a visible live counter with its computation date", () => {
    expect(displayableMetric(row(), { value: 42, computedAt }, LIVE_KEYS)).toEqual({
      key: "jobs_facilitated",
      label: "Jobs facilitated",
      value: 42,
      definition: "Job listings published on the platform.",
      asOf: "2026-11-07",
      mode: "live",
    });
  });

  it("never shows hidden or invisible metrics", () => {
    expect(displayableMetric(row({ mode: "hidden" }), { value: 42, computedAt }, LIVE_KEYS)).toBeNull();
    expect(displayableMetric(row({ isVisible: false }), { value: 42, computedAt }, LIVE_KEYS)).toBeNull();
  });

  it("never shows a metric without a public definition", () => {
    expect(displayableMetric(row({ definition: "  " }), { value: 42, computedAt }, LIVE_KEYS)).toBeNull();
  });

  it("never shows live values from unknown counters or invalid values", () => {
    expect(displayableMetric(row({ liveQueryKey: "made_up" }), { value: 42, computedAt }, LIVE_KEYS)).toBeNull();
    expect(displayableMetric(row(), null, LIVE_KEYS)).toBeNull();
    expect(displayableMetric(row(), { value: -1, computedAt }, LIVE_KEYS)).toBeNull();
    expect(displayableMetric(row(), { value: Number.NaN, computedAt }, LIVE_KEYS)).toBeNull();
  });

  it("shows an approved manual figure with its approved as-of date", () => {
    expect(displayableMetric(approvedManual(), null, LIVE_KEYS)).toMatchObject({ value: 120, asOf: "2026-10-31", mode: "manual" });
  });

  it("never leaks an unapproved manual figure", () => {
    expect(displayableMetric(approvedManual({ approvedAt: null, approvedValue: null, approvedAsOfDate: null }), null, LIVE_KEYS)).toBeNull();
  });

  it("never shows a manual figure edited after approval", () => {
    expect(displayableMetric(approvedManual({ manualValue: 500 }), null, LIVE_KEYS)).toBeNull();
    expect(displayableMetric(approvedManual({ asOfDate: "2026-11-30" }), null, LIVE_KEYS)).toBeNull();
  });

  it("never shows a manual figure without evidence", () => {
    expect(displayableMetric(approvedManual({ evidenceNote: null, evidenceFileId: null }), null, LIVE_KEYS)).toBeNull();
    expect(manualApprovalIsCurrent(approvedManual({ evidenceNote: null, evidenceFileId: "f" }))).toBe(true);
  });

  it("ignores live values for manual metrics (no mixing)", () => {
    expect(displayableMetric(approvedManual({ approvedAt: null, approvedValue: null, approvedAsOfDate: null }), { value: 999, computedAt }, LIVE_KEYS)).toBeNull();
  });

  it("respects the display threshold", () => {
    expect(displayableMetric(row({ minDisplayValue: 50 }), { value: 42, computedAt }, LIVE_KEYS)).toBeNull();
    expect(displayableMetric(row({ minDisplayValue: 42 }), { value: 42, computedAt }, LIVE_KEYS)?.value).toBe(42);
  });
});
