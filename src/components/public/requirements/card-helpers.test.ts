import { describe, expect, it } from "vitest";

import { marketingT } from "../marketing-i18n";
import { pickPosters, relativeTime, requirementApplyHref, requirementJobLabel, requirementWhatsAppHref, requirementWhatsAppMessage } from "./card-helpers";

const URL = "https://venkatsai.example/requirements/dubai-mechanical-helper";

describe("requirement card links", () => {
  it("opens the CV form with the requirement picked", () => {
    expect(requirementApplyHref("dubai-mechanical-helper")).toBe("/send-cv?requirement=dubai-mechanical-helper");
    expect(requirementApplyHref("a b&c")).toBe("/send-cv?requirement=a%20b%26c");
  });

  it("names the job with its country, without repeating a country the title already has", () => {
    expect(requirementJobLabel("Mechanical helper", "United Arab Emirates")).toBe("Mechanical helper (United Arab Emirates)");
    expect(requirementJobLabel("  Welders for   Saudi Arabia ", "Saudi Arabia")).toBe("Welders for Saudi Arabia");
    expect(requirementJobLabel("Pipe fitter", null)).toBe("Pipe fitter");
    expect(requirementJobLabel("Pipe fitter", "  ")).toBe("Pipe fitter");
  });

  it("builds the WhatsApp message to the office with the job and its link", () => {
    expect(requirementWhatsAppMessage({ title: "Dubai - Mechanical helper", countryName: "United Arab Emirates", url: URL })).toBe(
      `Hello Venkat Sai, I want to apply for Dubai - Mechanical helper (United Arab Emirates). ${URL}`,
    );
    expect(requirementWhatsAppMessage({ title: "Electrician", countryName: null, url: URL })).toBe(`Hello Venkat Sai, I want to apply for Electrician. ${URL}`);
  });

  it("writes the message in the page language and keeps the job and link as they are", () => {
    for (const locale of ["hi", "te", "or", "ar"] as const) {
      const text = requirementWhatsAppMessage({ title: "Welder", countryName: "Qatar", url: URL }, marketingT(locale));
      expect(text, locale).toContain("Welder (Qatar)");
      expect(text, locale).toContain(URL);
      expect(text, locale).toContain("Venkat Sai");
      expect(text, locale).not.toMatch(/\{(job|link)\}/);
    }
  });

  it("links to the office WhatsApp number with the message encoded", () => {
    const href = requirementWhatsAppHref({ title: "Welder & fitter", countryName: "Oman", url: URL });
    expect(href.startsWith("https://wa.me/919494263388?text=")).toBe(true);
    const text = decodeURIComponent(href.split("?text=")[1]!);
    expect(text).toBe(`Hello Venkat Sai, I want to apply for Welder & fitter (Oman). ${URL}`);
    expect(requirementWhatsAppHref({ title: "Welder", url: URL }, undefined, "+91 77804 53087")).toMatch(/^https:\/\/wa\.me\/917780453087\?text=/);
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 10, 23, 12, 0, 0);

  it("keeps the site's English wording", () => {
    expect(relativeTime(new Date(Date.now() - 3 * 86_400_000), "en")).toBe("3 days ago");
  });

  it("uses the page language for the other languages", () => {
    const threeDays = new Date(now - 3 * 86_400_000);
    expect(relativeTime(threeDays, "hi", now)).toBe(new Intl.RelativeTimeFormat("hi-IN", { numeric: "auto" }).format(-3, "day"));
    expect(relativeTime(new Date(now - 14 * 86_400_000), "te", now)).toBe(new Intl.RelativeTimeFormat("te-IN", { numeric: "auto" }).format(-2, "week"));
    expect(relativeTime(new Date(now - 30_000), "ar", now)).toBe(new Intl.RelativeTimeFormat("ar-AE-u-nu-latn", { numeric: "auto" }).format(-30, "second"));
  });
});

describe("pickPosters", () => {
  const items = ["a", "b", "c", "d"].map((slug) => ({ slug }));

  it("keeps the newest-first order and the limit", () => {
    expect(pickPosters(items, { limit: 3 }).map((p) => p.slug)).toEqual(["a", "b", "c"]);
    expect(pickPosters(items, { limit: 0 })).toEqual([]);
    expect(pickPosters(items, { limit: 2.7 }).map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("leaves out the requirement the visitor is reading", () => {
    expect(pickPosters(items, { limit: 3, excludeSlug: "b" }).map((p) => p.slug)).toEqual(["a", "c", "d"]);
    expect(pickPosters(items, { limit: 3, excludeSlug: null }).map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });
});
