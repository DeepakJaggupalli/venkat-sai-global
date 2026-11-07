import { describe, expect, it } from "vitest";

import {
  analyticsHref,
  barPercent,
  currencyFractionDigits,
  describeRange,
  formatDuration,
  isPreviewablePath,
  minorToMajorInput,
  propEntries,
  rangeParams,
  returningVisitors,
} from "./format";
import { cellRects, densityScale, fitScale, heatColor, visibleRects } from "./heatmap-utils";

describe("analytics dashboard formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(44.6)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3780)).toBe("1h 03m");
  });

  it("never returns negative returning visitors", () => {
    expect(returningVisitors(10, 4)).toBe(6);
    expect(returningVisitors(3, 5)).toBe(0);
  });

  it("keeps ranges in links", () => {
    expect(rangeParams({ preset: "7d", from: "2026-11-01", to: "2026-11-07" })).toEqual({ range: "7d" });
    expect(rangeParams({ preset: "custom", from: "2026-10-01", to: "2026-10-31" })).toEqual({ range: "custom", from: "2026-10-01", to: "2026-10-31" });
    expect(analyticsHref("/admin/analytics/events", { preset: "30d", from: "a", to: "b" }, { name: "page_view", path: "" })).toBe(
      "/admin/analytics/events?range=30d&name=page_view",
    );
    expect(analyticsHref("/admin/analytics", null)).toBe("/admin/analytics");
  });

  it("converts minor units with the currency's precision", () => {
    expect(currencyFractionDigits("INR")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(currencyFractionDigits("not-a-code")).toBe(2);
    expect(minorToMajorInput(125000, "INR")).toBe("1250.00");
    expect(minorToMajorInput(5000, "JPY")).toBe("5000");
    expect(minorToMajorInput(null, "USD")).toBe("");
  });

  it("only previews concrete public paths", () => {
    expect(isPreviewablePath("/jobs")).toBe(true);
    expect(isPreviewablePath("/jobs/[id]")).toBe(false);
    expect(isPreviewablePath("//evil.example")).toBe(false);
    expect(isPreviewablePath("/admin/analytics")).toBe(false);
    expect(isPreviewablePath("https://example.com")).toBe(false);
  });

  it("sizes bars", () => {
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(1, 1000)).toBe(2);
    expect(barPercent(10, 10)).toBe(100);
  });

  it("describes ranges and props", () => {
    expect(describeRange("2026-11-01", "2026-11-01")).toBe("1 Nov 2026");
    expect(describeRange("2026-10-01", "2026-10-31")).toContain("–");
    expect(propEntries({ jobId: "x", empty: "", n: null, count: 2 })).toEqual(["jobId: x", "count: 2"]);
  });
});

describe("heatmap maths", () => {
  it("scales density with a visible minimum", () => {
    expect(densityScale(0, 10)).toBe(0);
    expect(densityScale(10, 10)).toBe(1);
    expect(densityScale(1, 10_000)).toBeGreaterThanOrEqual(0.08);
  });

  it("produces translucent ramp colours", () => {
    expect(heatColor(0)).toBe("rgba(134, 182, 239, 0.35)");
    expect(heatColor(1)).toBe("rgba(13, 54, 107, 0.85)");
    expect(heatColor(Number.NaN)).toBe(heatColor(0));
  });

  it("maps cells to document rectangles and clips to the window", () => {
    const rects = cellRects(
      [
        { x: 500, y: 0, count: 4 },
        { x: 0, y: 1000, count: 1 },
      ],
      1000,
    );
    expect(rects[0]).toMatchObject({ x: 500, y: 0, width: 10, height: 25, density: 1 });
    expect(visibleRects(rects, 0, 800)).toHaveLength(1);
    expect(visibleRects(rects, 900, 800)).toHaveLength(1);
  });

  it("fits a viewport into its container without enlarging", () => {
    expect(fitScale(640, 1280)).toBe(0.5);
    expect(fitScale(2000, 1280)).toBe(1);
    expect(fitScale(0, 1280)).toBe(1);
  });
});
