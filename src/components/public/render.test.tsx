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

describe("contact building blocks", () => {
  it("merges CMS contact settings over the business defaults", async () => {
    const { resolveContact, toE164 } = await import("./contact-links");
    const defaults = resolveContact(null);
    expect(defaults.phones).toHaveLength(5);
    expect(defaults.emails).toEqual(["vsweld@gmail.com", "hrvsweld@gmail.com"]);
    expect(defaults.whatsappGroupUrl).toBeNull();
    const cms = resolveContact({ phone: "+91 98480 00000", email: "jobs@example.com", whatsappGroupUrl: "https://chat.whatsapp.com/abc", address: "Line 1\nLine 2" });
    expect(cms.phones[0]).toEqual({ e164: "+919848000000", display: "+91 98480 00000" });
    expect(cms.phones).toHaveLength(6);
    expect(cms.emails[0]).toBe("jobs@example.com");
    expect(cms.addressLines).toEqual(["Line 1", "Line 2"]);
    expect(cms.whatsappGroupUrl).toBe("https://chat.whatsapp.com/abc");
    expect(resolveContact({ whatsappGroupUrl: "javascript:alert(1)" }).whatsappGroupUrl).toBeNull();
    expect(resolveContact({ phone: "+919494263388" }).phones[0]?.display).toBe("94942 63388");
    expect(toE164("94942 63388")).toBe("+919494263388");
  });

  it("renders every phone and email as links, and the map without inline styles", async () => {
    const { ContactIcons, ContactList, MapEmbed } = await import("./contact-links");
    const html = renderToStaticMarkup(
      <>
        <ContactList />
        <ContactIcons />
        <MapEmbed />
      </>,
    );
    for (const tel of ["+919494263388", "+917386649477", "+917780453087", "+919059955784", "+919441339848"]) expect(html).toContain(`tel:${tel}`);
    expect(html).toContain("mailto:vsweld@gmail.com");
    expect(html).toContain("mailto:hrvsweld@gmail.com");
    expect(html).toContain("https://wa.me/919494263388");
    expect(html).toContain("<iframe");
    expect(html).not.toContain("style=");
  });

  it("hides the WhatsApp group band without a link and duplicates marquee items for assistive tech only once", async () => {
    const { WhatsAppGroupBand } = await import("./home/bands");
    const { Marquee } = await import("./marquee");
    expect(renderToStaticMarkup(<WhatsAppGroupBand url={null} />)).toBe("");
    const html = renderToStaticMarkup(<Marquee label="Trades" items={["Rigger"]} itemKey={(t) => t} render={(t) => t} />);
    expect(html.match(/Rigger/g)).toHaveLength(2);
    expect(html).toContain('aria-hidden="true"');
  });

  it("matches the featured service cards to CMS services by slug", async () => {
    const { matchFeaturedServices } = await import("./home/featured-services");
    const cards = matchFeaturedServices([
      { slug: "bulk-manpower-supply", path: "/services/bulk-manpower-supply", heroAssetId: null },
      { slug: "overseas-employment", path: null, heroAssetId: null },
    ]);
    expect(cards.map((c) => c.entry?.slug ?? null)).toEqual(["overseas-employment", null, "bulk-manpower-supply"]);
  });
});
