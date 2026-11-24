import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ absoluteUrl: (path = "/") => `https://venkatsai.test${path}` }));
// Server-only neighbours of the section: the loader (database) and the job-alerts button (async server component).
vi.mock("./data", () => ({ loadPosterPage: vi.fn() }));
vi.mock("../push/job-alerts", () => ({ JobAlerts: () => null }));

import { RouteCard } from "../home/hero-card";
import { marketingT } from "../marketing-i18n";
import type { PosterCard as PosterCardData } from "./data";
import { RequirementsSection } from "./latest-requirements";
import { PosterCard } from "./poster-card";

const posterImage = {
  id: "asset-1",
  kind: "image" as const,
  title: "Poster",
  alt: "Recruitment poster",
  caption: null,
  credit: null,
  url: "/media/asset-1/poster.jpg",
  thumbnailUrl: null,
  variants: { md: "/media/asset-1/md.webp" },
  width: 1080,
  height: 1350,
  mimeType: "image/jpeg",
  embedProvider: null,
  embedUrl: null,
};

function card(overrides: Partial<PosterCardData> = {}): PosterCardData {
  return {
    id: "p1",
    slug: "dubai-mechanical-helper",
    href: "/requirements/dubai-mechanical-helper",
    title: "Dubai - Mechanical helper",
    summary: null,
    countryCode: "AE",
    countryName: "United Arab Emirates",
    companyName: null,
    trades: [
      { trade: "Mechanical helper", pay: "900 AED + food allowance 350 AED" },
      { trade: "Pipe fitter", pay: "1,400 AED" },
      { trade: "Welder", pay: null },
      { trade: "Rigger", pay: null },
      { trade: "Driver", pay: null },
    ],
    benefits: ["Free accommodation"],
    description: null,
    applyBy: "2026-12-01",
    publishedAt: new Date(Date.now() - 2 * 86_400_000),
    poster: null,
    alt: "Recruitment poster: Dubai - Mechanical helper",
    ...overrides,
  };
}

const decode = (html: string) => html.replace(/&amp;/g, "&");

describe("PosterCard", () => {
  it("gives every requirement an Apply button and a WhatsApp button to the office", () => {
    const html = decode(renderToStaticMarkup(<PosterCard poster={card()} />));
    expect(html).toContain('href="/send-cv?requirement=dubai-mechanical-helper"');
    expect(html).toContain('aria-label="Apply for Dubai - Mechanical helper"');
    const wa = /href="(https:\/\/wa\.me\/919494263388\?text=[^"]+)"/.exec(html)?.[1];
    expect(wa).toBeTruthy();
    expect(decodeURIComponent(wa!.split("?text=")[1]!)).toBe(
      "Hello Venkat Sai, I want to apply for Dubai - Mechanical helper (United Arab Emirates). https://venkatsai.test/requirements/dubai-mechanical-helper",
    );
    expect(html).toContain('target="_blank"');
    // The title link stretches over the card; the buttons sit above it.
    expect(html).toContain('href="/requirements/dubai-mechanical-helper"');
    expect(html).toContain("relative z-10");
  });

  it("shows a poster without an image as a clean text card, never an apply-by date", () => {
    const html = renderToStaticMarkup(<PosterCard poster={card()} />);
    expect(html).toContain('data-variant="text"');
    // Only the flag is an image.
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('src="/flags/ae.svg"');
    expect(html).toContain("United Arab Emirates");
    expect(html).toContain("900 AED + food allowance 350 AED");
    expect(html).toContain("and 2 more");
    expect(html).toContain("Posted <time");
    expect(html).not.toMatch(/apply by/i);
    expect(html).not.toContain("2026-12-01");
  });

  it("shows the poster image when there is one", () => {
    const html = renderToStaticMarkup(<PosterCard poster={card({ poster: posterImage })} />);
    expect(html).toContain('data-variant="poster"');
    expect(html).toContain("/media/asset-1/md.webp");
    expect(html).toContain('alt="Recruitment poster: Dubai - Mechanical helper"');
  });

  it("follows the page language", () => {
    const t = marketingT("te");
    const html = renderToStaticMarkup(<PosterCard poster={card()} t={t} />);
    expect(html).toContain(`>${t("card.apply")}<`);
    expect(html).toContain(t("card.whatsapp"));
  });
});

describe("RequirementsSection", () => {
  it("is the #requirements anchor with a link to every requirement and to referrals", () => {
    const html = renderToStaticMarkup(<RequirementsSection posters={[card(), card({ id: "p2", slug: "doha-welder", href: "/requirements/doha-welder", title: "Welder" })]} showRefer />);
    expect(html).toContain('id="requirements"');
    expect(html).toContain("Latest requirements");
    expect(html.match(/data-testid="poster-card"/g)).toHaveLength(2);
    expect(html).toContain('href="/requirements"');
    expect(html).toContain("See all requirements");
    expect(html).toContain('href="/refer"');
  });

  it("renders nothing without requirements", () => {
    expect(renderToStaticMarkup(<RequirementsSection posters={[]} />)).toBe("");
  });
});

describe("RouteCard", () => {
  it("renders the still picture before any motion: the plane mid-route and the first destination", () => {
    const html = renderToStaticMarkup(<RouteCard />);
    expect(html).toContain('transform="translate(300 22) rotate(0)"');
    expect(html).toContain("M0 88 Q300 -44 600 88");
    expect(html).toContain("rtl:-scale-x-100");
    // Every city sits in the same cell; only Dubai is visible.
    expect(html.match(/opacity-100/g)).toHaveLength(1);
    expect(html.indexOf("Dubai")).toBeLessThan(html.indexOf("opacity-0"));
    expect(html).toContain("Kuwait City");
    expect(html).toContain("Moscow");
    expect(html).toMatch(/class="sr-only">Destinations: Dubai, Riyadh, .*and Manama</);
  });
});
