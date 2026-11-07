import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CheckList, FaqList, FeatureGrid, StepList } from "./blocks";
import { MetricsSection } from "./home/metrics";
import { serializeJsonLd } from "./json-ld";
import { htmlToText } from "./text";
import { AudienceGlyph, BeadPattern, HeroGlobe, HorizonOrnament, ReachMap } from "./visuals";

describe("public visuals", () => {
  it("render decorative SVG without inline styles", () => {
    const html = renderToStaticMarkup(
      <>
        <HeroGlobe />
        <ReachMap points={[{ code: "QA", label: "Qatar", region: "gcc" }, { code: "ZZ", label: "Nowhere" }]} />
        <BeadPattern />
        <HorizonOrnament />
        <AudienceGlyph variant="partners" />
      </>,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("style=");
    expect(html).toContain("Qatar");
    expect(html).not.toContain("Nowhere");
  });
});

describe("content blocks", () => {
  it("render nothing for empty lists", () => {
    expect(renderToStaticMarkup(<FeatureGrid items={[]} />)).toBe("");
    expect(renderToStaticMarkup(<StepList steps={[{ title: " " }]} />)).toBe("");
    expect(renderToStaticMarkup(<CheckList items={[null, ""]} />)).toBe("");
    expect(renderToStaticMarkup(<FaqList faqs={[{ question: "Q", answer: "" }]} />)).toBe("");
  });

  it("number steps for screen readers", () => {
    const html = renderToStaticMarkup(<StepList steps={[{ title: "Apply" }, { title: "Interview" }]} />);
    expect(html).toContain("Step 2: </span>Interview");
  });

  it("hides the metrics section without approved figures and shows the as-of date otherwise", () => {
    expect(renderToStaticMarkup(<MetricsSection metrics={[]} />)).toBe("");
    const html = renderToStaticMarkup(
      <MetricsSection metrics={[{ key: "jobs_facilitated", label: "Jobs facilitated", value: 1234, definition: "Jobs ever published.", asOf: "2026-11-01", mode: "manual" }]} />,
    );
    expect(html).toContain("1,234");
    expect(html).toContain("As of ");
    expect(html).toContain("2026");
  });
});

describe("text helpers", () => {
  it("strips HTML and truncates on a word boundary", () => {
    expect(htmlToText("<p>Hello&nbsp;<strong>world</strong></p><p>Again</p>")).toBe("Hello world Again");
    expect(htmlToText("<p>one two three four</p>", 10)).toBe("one two…");
  });

  it("escapes characters that could close a script element", () => {
    const out = serializeJsonLd({ name: "</script><b>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><b>" });
  });
});
