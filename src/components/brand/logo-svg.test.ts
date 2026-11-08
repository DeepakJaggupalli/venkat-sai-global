import { describe, expect, it } from "vitest";

import { LOCKUP_WIDTH, MARK, MARK_SIZE, WORDMARK, WORDMARK_WIDTH } from "./logo-geometry";
import { getLogoDataUri, getLogoSvg } from "./logo-svg";

describe("getLogoSvg", () => {
  it("renders the full lockup with an accessible name", () => {
    const svg = getLogoSvg();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${LOCKUP_WIDTH} ${MARK_SIZE}"`);
    expect(svg).toContain('aria-label="Venkat Sai Global"');
    expect(svg).toContain(">Venkat Sai</text>");
    expect(svg).toContain(">Global</text>");
    for (const d of MARK.arcPaths) expect(svg).toContain(d);
  });

  it("renders the mark only and scales by height", () => {
    const svg = getLogoSvg({ layout: "mark", height: 24 });
    expect(svg).toContain('width="24" height="24"');
    expect(svg).not.toContain("<text");
  });

  it("switches palette and tile for dark backgrounds", () => {
    const light = getLogoSvg({ variant: "onLight" });
    const dark = getLogoSvg({ variant: "onDark" });
    expect(light).toContain('fill="#0A0A0B"');
    expect(light).toContain('stroke="#0EA5E9"');
    expect(dark).toContain('fill-opacity="0.08"');
    expect(dark).toContain('fill="#FFFFFF" font-weight="800"');
  });

  it("keeps the wordmark inside the lockup width", () => {
    expect(WORDMARK.primary.length + WORDMARK.wordGap + WORDMARK.secondary.length).toBeLessThanOrEqual(WORDMARK_WIDTH);
    expect(LOCKUP_WIDTH).toBe(MARK_SIZE + WORDMARK.markGap + WORDMARK_WIDTH);
  });

  it("produces an encoded data URI", () => {
    const uri = getLogoDataUri({ layout: "mark" });
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")).toBe(true);
  });
});
