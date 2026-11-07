import { describe, expect, it } from "vitest";

import {
  buildSafeSelector,
  extractUtm,
  isPrivateAreaPath,
  isSafeElementId,
  isTrackablePath,
  normalizeAnalyticsPath,
  normalizeUtmValue,
  pickAllowedQueryParams,
  referrerDomainFrom,
  resolveOccurredAt,
  sanitizeAnalyticsKey,
  sanitizeEventProps,
  sanitizeSelectorString,
  viewportBucket,
  type SelectorNode,
} from "./privacy-rules";

describe("normalizeAnalyticsPath", () => {
  it("keeps the path only and collapses slashes", () => {
    expect(normalizeAnalyticsPath("https://example.test/jobs/?page=2#top")).toBe("/jobs");
    expect(normalizeAnalyticsPath("/jobs//welder-dubai/")).toBe("/jobs/welder-dubai");
    expect(normalizeAnalyticsPath("/")).toBe("/");
    expect(normalizeAnalyticsPath("services")).toBe("/services");
    expect(normalizeAnalyticsPath("")).toBeNull();
    expect(normalizeAnalyticsPath(undefined)).toBeNull();
  });

  it("replaces identifiers and secrets with placeholders", () => {
    expect(normalizeAnalyticsPath("/talent/applications/0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11")).toBe("/talent/applications/[id]");
    expect(normalizeAnalyticsPath("/invite/0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11.sEcReT123abcDEF")).toBe("/invite/[token]");
    expect(normalizeAnalyticsPath("/invite/whatever")).toBe("/invite/[token]");
    expect(normalizeAnalyticsPath("/verify-certificate/ABC123")).toBe("/verify-certificate/[code]");
    expect(normalizeAnalyticsPath("/profile/ravi.kumar@example.com")).toBe("/profile/[redacted]");
    expect(normalizeAnalyticsPath("/call/+919876543210")).toBe("/call/[redacted]");
    expect(normalizeAnalyticsPath("/admin/applications/VSG-APP-000123")).toBe("/admin/applications/[code]");
    expect(normalizeAnalyticsPath("/reset/Zx9kQ2mP7vL3nR8tY1wB4cD6")).toBe("/reset/[token]");
    expect(normalizeAnalyticsPath("/orders/12345678")).toBe("/orders/[n]");
    expect(normalizeAnalyticsPath("/media/0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11/ravi-kumar-resume.pdf")).toBe("/media/[id]/[name]");
  });

  it("keeps ordinary slugs, dates and page numbers", () => {
    expect(normalizeAnalyticsPath("/jobs/senior-tig-welder-dubai-uae-2026")).toBe("/jobs/senior-tig-welder-dubai-uae-2026");
    expect(normalizeAnalyticsPath("/events/2026-11-07")).toBe("/events/2026-11-07");
    expect(normalizeAnalyticsPath("/blog/page/2")).toBe("/blog/page/2");
    expect(normalizeAnalyticsPath("/services/welding-and-industrial-testing")).toBe("/services/welding-and-industrial-testing");
  });

  it("percent-encodes unsafe characters and bounds the length", () => {
    expect(normalizeAnalyticsPath("/search/two words")).toBe("/search/two%20words");
    const long = `/${"a".repeat(600)}/${"b".repeat(600)}`;
    const normalized = normalizeAnalyticsPath(long)!;
    expect(normalized.length).toBeLessThanOrEqual(1024);
    expect(normalized).toMatch(/^\/[^?#\s]*$/);
  });
});

describe("path classes", () => {
  it("excludes staff and API paths from tracking", () => {
    expect(isTrackablePath("/admin")).toBe(false);
    expect(isTrackablePath("/admin/analytics")).toBe(false);
    expect(isTrackablePath("/api/v1/collect")).toBe(false);
    expect(isTrackablePath("/administration")).toBe(true);
    expect(isTrackablePath("/jobs")).toBe(true);
  });

  it("recognises signed-in areas", () => {
    expect(isPrivateAreaPath("/talent/profile")).toBe(true);
    expect(isPrivateAreaPath("/account")).toBe(true);
    expect(isPrivateAreaPath("/talented")).toBe(false);
    expect(isPrivateAreaPath("/jobs")).toBe(false);
  });
});

describe("pickAllowedQueryParams", () => {
  it("keeps only whitelisted keys with safe values", () => {
    expect(pickAllowedQueryParams("?page=2&type=internship&q=ravi+kumar&email=a%40b.com&category=welding")).toEqual({
      page: "2",
      type: "internship",
      category: "welding",
    });
  });

  it("drops unsafe values, duplicates and non-whitelisted keys", () => {
    expect(pickAllowedQueryParams("type=hello world&type=second&overseas=1&token=abc")).toEqual({ overseas: "1" });
    expect(pickAllowedQueryParams("category=someone@example.com")).toEqual({});
    expect(pickAllowedQueryParams("category=0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11")).toEqual({});
    expect(pickAllowedQueryParams("utm_source=google")).toEqual({});
    expect(pickAllowedQueryParams(new URLSearchParams({ Intent: "employer" }))).toEqual({ intent: "employer" });
    expect(pickAllowedQueryParams(null)).toEqual({});
  });
});

describe("UTM and referrer", () => {
  it("lower-cases UTM values and rejects personal data", () => {
    expect(extractUtm("?utm_source=Google&utm_medium=CPC&utm_campaign=Diwali-2026")).toEqual({ source: "google", medium: "cpc", campaign: "diwali-2026" });
    expect(extractUtm("?utm_source=me@example.com&utm_campaign=+919876543210")).toBeNull();
    expect(extractUtm("?page=1")).toBeNull();
    expect(normalizeUtmValue("x".repeat(201))).toBeNull();
  });

  it("extracts the referring host, ignoring same-site and non-http referrers", () => {
    expect(referrerDomainFrom("https://www.Google.com/search?q=welder", "venkatsai.test")).toBe("www.google.com");
    expect(referrerDomainFrom("https://venkatsai.test/jobs", "venkatsai.test")).toBeNull();
    expect(referrerDomainFrom("android-app://com.google.android.gm", "venkatsai.test")).toBeNull();
    expect(referrerDomainFrom("not a url", null)).toBeNull();
    expect(referrerDomainFrom("", null)).toBeNull();
  });
});

describe("keys and viewport", () => {
  it("sanitises form and CTA ids", () => {
    expect(sanitizeAnalyticsKey(" Employer_Enquiry ")).toBe("employer_enquiry");
    expect(sanitizeAnalyticsKey("hire-through-venkat-sai")).toBe("hire-through-venkat-sai");
    expect(sanitizeAnalyticsKey("a b")).toBeNull();
    expect(sanitizeAnalyticsKey("someone@example.com")).toBeNull();
    expect(sanitizeAnalyticsKey(null)).toBeNull();
  });

  it("buckets viewport widths", () => {
    expect(viewportBucket(360)).toBe("mobile");
    expect(viewportBucket(800)).toBe("tablet");
    expect(viewportBucket(1440)).toBe("desktop");
    expect(viewportBucket(Number.NaN)).toBe("mobile");
  });
});

function node(tagName: string, attrs: Record<string, string> = {}, parent: SelectorNode | null = null): SelectorNode {
  return {
    tagName: tagName.toUpperCase(),
    id: attrs.id ?? "",
    getAttribute: (name: string) => (name in attrs ? attrs[name]! : null),
    parentElement: parent,
  };
}

describe("buildSafeSelector", () => {
  it("builds a path from tags, safe ids and data-analytics keys only", () => {
    const body = node("body");
    const main = node("main", {}, body);
    const section = node("section", { id: "hero", class: "bg-navy text-white" }, main);
    const div = node("div", { class: "flex gap-2" }, section);
    const link = node("a", { href: "/employers", "data-analytics-cta": "Hire_Through_Venkat_Sai", title: "Ravi Kumar" }, div);
    expect(buildSafeSelector(link)).toBe("section#hero > div > a[cta:hire_through_venkat_sai]");
  });

  it("skips ids that look personal or generated", () => {
    const body = node("body");
    const form = node("form", { id: "user-12345" }, body);
    const button = node("button", { id: "radix-r1" }, form);
    expect(buildSafeSelector(button)).toBe("form > button");
    expect(isSafeElementId("candidate-0b9e3c1a")).toBe(true);
    expect(isSafeElementId("ravi.kumar@example.com")).toBe(false);
    expect(isSafeElementId("0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11")).toBe(false);
  });

  it("returns null inside data-analytics-ignore, even above the depth limit", () => {
    const body = node("body");
    const ignored = node("div", { "data-analytics-ignore": "" }, body);
    let current: SelectorNode = ignored;
    for (let i = 0; i < 8; i++) current = node("div", {}, current);
    expect(buildSafeSelector(current)).toBeNull();
    expect(buildSafeSelector(node("span", {}, ignored))).toBeNull();
  });

  it("never emits characters rejected by the database CHECK", () => {
    const body = node("body");
    const el = node("div", { id: "x\"y", "data-analytics-id": "a=b" }, body);
    const selector = buildSafeSelector(el);
    expect(selector).toBe("div");
  });
});

describe("sanitizeSelectorString", () => {
  it("accepts selectors in the tracker's format", () => {
    expect(sanitizeSelectorString("section#hero > div > a[cta:hire_through_venkat_sai]")).toBe("section#hero > div > a[cta:hire_through_venkat_sai]");
    expect(sanitizeSelectorString("main > button[id:apply]")).toBe("main > button[id:apply]");
  });

  it("rejects anything else", () => {
    expect(sanitizeSelectorString("div.someone@example.com")).toBeNull();
    expect(sanitizeSelectorString('input[value="secret"]')).toBeNull();
    expect(sanitizeSelectorString("div#user-123456")).toBeNull();
    expect(sanitizeSelectorString("div:hover")).toBeNull();
    expect(sanitizeSelectorString("")).toBeNull();
    expect(sanitizeSelectorString(null)).toBeNull();
  });
});

describe("sanitizeEventProps", () => {
  it("keeps flat non-personal values", () => {
    expect(sanitizeEventProps({ jobId: "0B9E3C1A-6F1D-4C55-9A1E-2F9A0C3B7D11", count: 3, overseas: true, category: "welding", none: null })).toEqual({
      jobId: "0b9e3c1a-6f1d-4c55-9a1e-2f9a0c3b7d11",
      count: 3,
      overseas: true,
      category: "welding",
      none: null,
    });
  });

  it("drops personal keys, personal values, nested objects and bad keys", () => {
    expect(
      sanitizeEventProps({
        email: "x@y.z",
        name: "Ravi",
        q: "welder in dubai",
        contact: "ravi@example.com",
        mobile2: "+91 98765 43210",
        nested: { a: 1 },
        list: [1, 2],
        "bad key": "x",
        long: "x".repeat(201),
        multi: "line\nbreak",
        inf: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({});
  });

  it("limits the number of keys and the encoded size", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeEventProps(many))).toHaveLength(20);
    const wide = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, "అ".repeat(190)]));
    const kept = sanitizeEventProps(wide);
    expect(new TextEncoder().encode(JSON.stringify(kept)).length).toBeLessThanOrEqual(3000);
    expect(Object.keys(kept).length).toBeGreaterThan(0);
    expect(sanitizeEventProps(null)).toEqual({});
    expect(sanitizeEventProps([1, 2])).toEqual({});
  });
});

describe("resolveOccurredAt", () => {
  const now = new Date("2026-11-07T10:00:00.000Z");
  it("corrects for client clock skew", () => {
    // Client clock is 1 hour ahead; the event happened 5 seconds before sending.
    const sentAt = now.getTime() + 3_600_000;
    expect(resolveOccurredAt(sentAt - 5000, sentAt, now).toISOString()).toBe("2026-11-07T09:59:55.000Z");
  });

  it("clamps to the last 24 hours and never into the future", () => {
    expect(resolveOccurredAt(0, 10 * 86_400_000, now).getTime()).toBe(now.getTime() - 86_400_000);
    expect(resolveOccurredAt(2000, 1000, now).getTime()).toBe(now.getTime());
    expect(resolveOccurredAt(undefined, undefined, now).getTime()).toBe(now.getTime());
  });
});
