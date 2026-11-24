import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { marketingT } from "../marketing-i18n";
import { HomeHero } from "./hero";

type Hero = Parameters<typeof HomeHero>[0]["hero"];

describe("HomeHero", () => {
  it("always shows the route card with the flight, even when the CMS homepage has a hero image", () => {
    const hero = { heading: "Skilled hands from Vizag to the world", mediaAssetId: "11111111-1111-4111-8111-111111111111" } as Hero;
    const html = renderToStaticMarkup(<HomeHero hero={hero} openRequirements={0} />);
    expect(html).toContain('data-testid="hero-route-card"');
    expect(html).toContain('data-testid="route-flight"');
    expect(html).not.toContain("<video");
    // No requirement published: Send your CV leads, nothing jumps to the (absent) list.
    expect(html).toContain('href="/send-cv"');
    expect(html).not.toContain('href="#requirements"');
  });

  it("leads with Apply for open jobs, jumping to the list below the hero, while requirements are published", () => {
    const html = renderToStaticMarkup(<HomeHero hero={null} openRequirements={3} />);
    const apply = /<a[^>]*href="#requirements"[^>]*>/.exec(html)?.[0] ?? "";
    expect(apply).toContain('data-testid="hero-apply-requirements"');
    expect(html).toContain("Apply for open jobs");
    expect(html).toContain('href="/send-cv"');
    expect(html).toContain('data-testid="hero-route-card"');
  });

  it("follows the page language", () => {
    const t = marketingT("te");
    const html = renderToStaticMarkup(<HomeHero hero={null} openRequirements={1} t={t} />);
    expect(html).toContain(t("hero.applyOpenJobs"));
    expect(html).toContain(t("route.dest.dubai.city"));
  });
});
