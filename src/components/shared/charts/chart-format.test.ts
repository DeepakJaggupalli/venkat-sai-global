import { describe, expect, it } from "vitest";

import { formatTick, formatValue, formatX, isEmptySeries, maxValue, toDonutSegments, withSeriesColors } from "./chart-format";
import { CHART_COLORS, CHART_OTHER, DONUT_MAX_SEGMENTS } from "./palette";

describe("chart formatting", () => {
  it("formats ticks in full below 10,000 and compact above", () => {
    expect(formatTick(2000, 8000, "en-US")).toBe("2,000");
    expect(formatTick(20000, 60000, "en-US")).toBe("20K");
  });

  it("formats values with Intl options", () => {
    expect(formatValue(0.256, { style: "percent", maximumFractionDigits: 1 }, "en-US")).toBe("25.6%");
    expect(formatValue(null)).toBe("—");
  });

  it("formats ISO dates on the x axis", () => {
    expect(formatX("2026-11-07", "date", "en-GB")).toBe("7 Nov");
    expect(formatX("2026-11", "month", "en-GB")).toBe("Nov 2026");
    expect(formatX("Welder", "date")).toBe("Welder");
  });

  it("computes max values (stacked sums)", () => {
    const data = [
      { x: "a", s1: 3, s2: 4 },
      { x: "b", s1: 10, s2: -1 },
    ];
    expect(maxValue(data, ["s1", "s2"])).toBe(10);
    expect(maxValue(data, ["s1", "s2"], true)).toBe(9);
  });

  it("assigns palette colours by position and keeps explicit colours", () => {
    const series = withSeriesColors([{ key: "a", label: "A" }, { key: "b", label: "B", color: "#000000" }]);
    expect(series[0]?.color).toBe(CHART_COLORS[0]);
    expect(series[1]?.color).toBe("#000000");
  });

  it("detects empty data", () => {
    expect(isEmptySeries([], ["a"])).toBe(true);
    expect(isEmptySeries([{ a: null }], ["a"])).toBe(true);
    expect(isEmptySeries([{ a: 0 }], ["a"])).toBe(false);
  });
});

describe("toDonutSegments", () => {
  it("computes shares and drops non-positive values", () => {
    const segments = toDonutSegments([
      { label: "Direct", value: 30 },
      { label: "Partners", value: 10 },
      { label: "Zero", value: 0 },
    ]);
    expect(segments.map((s) => [s.label, s.share])).toEqual([
      ["Direct", 0.75],
      ["Partners", 0.25],
    ]);
  });

  it("folds the tail into Other beyond the validated ring size", () => {
    const data = Array.from({ length: 9 }, (_, i) => ({ label: `S${i}`, value: 10 - i }));
    const segments = toDonutSegments(data);
    expect(segments).toHaveLength(DONUT_MAX_SEGMENTS);
    const other = segments[segments.length - 1];
    expect(other?.label).toBe("Other");
    expect(other?.fill).toBe(CHART_OTHER);
    expect(other?.value).toBe(5 + 4 + 3 + 2);
  });

  it("returns nothing when there is nothing to show", () => {
    expect(toDonutSegments([{ label: "A", value: 0 }])).toEqual([]);
  });
});
