import { describe, expect, it } from "vitest";

import { detectPreset, formatIsoDateLabel, isIsoDate, presetRange, rangeLabel, toIsoDate, validateRange } from "./date-range";
import { activeChips, groupOptions } from "./filter-utils";

// A fixed local "today": 7 Nov 2026.
const today = new Date(2026, 10, 7, 15, 30);

describe("date range presets", () => {
  it("formats local calendar dates without a UTC shift", () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("computes inclusive preset ranges", () => {
    expect(presetRange("today", today)).toEqual({ from: "2026-11-07", to: "2026-11-07" });
    expect(presetRange("7d", today)).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(presetRange("30d", today)).toEqual({ from: "2026-10-09", to: "2026-11-07" });
    expect(presetRange("mtd", today)).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(presetRange("ytd", today)).toEqual({ from: "2026-01-01", to: "2026-11-07" });
  });

  it("detects presets from params", () => {
    expect(detectPreset("2026-11-01", "2026-11-07", ["7d", "mtd"], today)).toBe("7d");
    expect(detectPreset("2026-11-02", "2026-11-07", undefined, today)).toBeNull();
    expect(detectPreset(undefined, "2026-11-07", undefined, today)).toBeNull();
  });

  it("labels the trigger", () => {
    expect(rangeLabel("2026-10-09", "2026-11-07", "Any time", today)).toBe("Last 30 days");
    expect(rangeLabel(undefined, undefined, "Any time", today)).toBe("Any time");
    expect(rangeLabel("2026-03-01", undefined, "Any time", today)).toMatch(/^From /);
    expect(rangeLabel(undefined, "2026-03-01", "Any time", today)).toMatch(/^Until /);
  });

  it("validates ISO dates and custom ranges", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("07/11/2026")).toBe(false);
    expect(validateRange("", "")).toMatch(/Choose/);
    expect(validateRange("2026-11-08", "2026-11-01")).toMatch(/on or before/);
    expect(validateRange("2026-11-01", "")).toBeNull();
  });

  it("formats ISO dates for display in UTC", () => {
    expect(formatIsoDateLabel("2026-11-07", "en-GB")).toBe("7 Nov 2026");
    expect(formatIsoDateLabel("not-a-date")).toBe("not-a-date");
  });
});

describe("filter helpers", () => {
  it("builds chips with option labels and date formatting", () => {
    const params = new URLSearchParams("status=published&country=AE&country=QA&from=2026-11-01");
    const chips = activeChips(
      [
        { param: "status", label: "Status", options: [{ value: "published", label: "Published" }] },
        { param: "country", label: "Country", options: [{ value: "AE", label: "United Arab Emirates" }] },
        { param: "from", label: "From", kind: "date" },
        { param: "q", label: "Search" },
      ],
      (k) => params.getAll(k),
    );
    expect(chips.map((c) => c.text)).toEqual(["Published", "United Arab Emirates", "QA", formatIsoDateLabel("2026-11-01")]);
  });

  it("groups options while preserving order", () => {
    const groups = groupOptions([
      { value: "a", label: "A" },
      { value: "b", label: "B", group: "G1" },
      { value: "c", label: "C", group: "G1" },
      { value: "d", label: "D" },
    ]);
    expect(groups.map(([g, items]) => [g, items.map((i) => i.value)])).toEqual([
      [null, ["a"]],
      ["G1", ["b", "c"]],
      [null, ["d"]],
    ]);
  });
});
