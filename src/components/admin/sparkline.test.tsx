import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Sparkline } from "./sparkline";

describe("Sparkline", () => {
  it("renders nothing for fewer than two points", () => {
    expect(renderToStaticMarkup(<Sparkline values={[3]} label="Users" />)).toBe("");
  });

  it("draws a path inside the viewBox and a screen-reader summary", () => {
    const html = renderToStaticMarkup(<Sparkline values={[0, 2, 5, 1]} label="Applications per week" width={100} height={20} />);
    expect(html).toContain('viewBox="0 0 100 20"');
    expect(html).toContain("Applications per week: 4 periods, 8 in total, latest 1, peak 5.");
    const coords = [...html.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(coords.length).toBeGreaterThan(0);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(20);
    }
  });

  it("handles a flat series without dividing by zero", () => {
    expect(renderToStaticMarkup(<Sparkline values={[0, 0, 0]} label="Flat" />)).not.toContain("NaN");
  });
});
