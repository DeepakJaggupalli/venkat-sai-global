import { describe, expect, it } from "vitest";

import {
  buildConsentVersion,
  buildCookieString,
  consentLevelFor,
  consentNeedsPrompt,
  effectiveConsent,
  generateRandomId,
  inferConsentMethod,
  isRandomId,
  parseConsentCookie,
  readCookieValue,
  serializeConsentCookie,
  toLedgerChoices,
  toReceiptCategories,
  type StoredConsent,
} from "./consent";

const VERSION = buildConsentVersion("2026-11-01");

const sample: StoredConsent = {
  version: VERSION,
  categories: { functional: true, analytics: true, session_insights: false },
  anonymousId: "abcdefghijklmnop1234",
  timestamp: "2026-11-07T10:00:00.000Z",
};

describe("consent cookie", () => {
  it("round-trips through serialise / parse", () => {
    const raw = serializeConsentCookie(sample);
    expect(raw).not.toMatch(/[;\s,]/);
    expect(parseConsentCookie(raw)).toEqual(sample);
    expect(parseConsentCookie(serializeConsentCookie({ ...sample, gpc: true }))).toEqual({ ...sample, gpc: true });
  });

  it("accepts plain JSON and fills missing categories with false", () => {
    const parsed = parseConsentCookie(JSON.stringify({ ...sample, categories: { analytics: true } }));
    expect(parsed?.categories).toEqual({ functional: false, analytics: true, session_insights: false });
  });

  it("rejects malformed or tampered values", () => {
    expect(parseConsentCookie(null)).toBeNull();
    expect(parseConsentCookie("")).toBeNull();
    expect(parseConsentCookie("not-json")).toBeNull();
    expect(parseConsentCookie("%E0%A4%A")).toBeNull();
    expect(parseConsentCookie(JSON.stringify({ ...sample, anonymousId: "ravi@example.com" }))).toBeNull();
    expect(parseConsentCookie(JSON.stringify({ ...sample, version: "bad version!" }))).toBeNull();
    expect(parseConsentCookie(JSON.stringify({ ...sample, categories: { analytics: "yes" } }))).toBeNull();
    expect(parseConsentCookie(JSON.stringify({ ...sample, categories: [] }))).toBeNull();
    expect(parseConsentCookie(JSON.stringify({ ...sample, timestamp: "yesterday" }))).toBeNull();
    expect(parseConsentCookie(JSON.stringify({ ...sample, gpc: "1" }))).toBeNull();
    expect(parseConsentCookie("x".repeat(3000))).toBeNull();
  });

  it("reads one cookie from a cookie header", () => {
    const header = `vsg_locale=hi; vsg_consent=${serializeConsentCookie(sample)}; other=1`;
    expect(parseConsentCookie(readCookieValue(header, "vsg_consent"))).toEqual(sample);
    expect(readCookieValue(header, "missing")).toBeNull();
  });

  it("builds a first-party cookie string", () => {
    expect(buildCookieString("vsg_consent", "v", { maxAgeSeconds: 31_536_000, secure: true })).toBe("vsg_consent=v; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    expect(buildCookieString("vsg_sid", "", { maxAgeSeconds: -5, secure: false })).toBe("vsg_sid=; Path=/; Max-Age=0; SameSite=Lax");
  });
});

describe("consent version and prompting", () => {
  it("combines the revision with the notice version", () => {
    expect(VERSION).toBe("1.2026-11-01");
    expect(buildConsentVersion("v 2 / final")).toBe("1.v2final");
    expect(buildConsentVersion("")).toBe("1.0");
  });

  it("prompts when there is no choice or the version changed", () => {
    expect(consentNeedsPrompt(null, VERSION)).toBe(true);
    expect(consentNeedsPrompt(sample, VERSION)).toBe(false);
    expect(consentNeedsPrompt(sample, buildConsentVersion("2027-01-01"))).toBe(true);
  });
});

describe("effectiveConsent", () => {
  it("grants nothing without a current choice", () => {
    expect(effectiveConsent(null, VERSION, false)).toEqual({ functional: false, analytics: false, session_insights: false });
    expect(effectiveConsent(sample, "1.other", false)).toEqual({ functional: false, analytics: false, session_insights: false });
  });

  it("treats Global Privacy Control as an opt-out of analytics and session insights by default", () => {
    const all = { ...sample, categories: { functional: true, analytics: true, session_insights: true } };
    expect(effectiveConsent(all, VERSION, true)).toEqual({ functional: true, analytics: false, session_insights: false });
    expect(effectiveConsent(all, VERSION, false)).toEqual(all.categories);
  });

  it("honours an explicit choice made while the GPC signal was on", () => {
    const explicit = { ...sample, gpc: true };
    expect(effectiveConsent(explicit, VERSION, true)).toEqual(sample.categories);
  });
});

describe("mappings", () => {
  it("maps categories to session consent levels", () => {
    expect(consentLevelFor({ functional: true, analytics: false, session_insights: true })).toBe("essential");
    expect(consentLevelFor({ functional: false, analytics: true, session_insights: false })).toBe("analytics");
    expect(consentLevelFor({ functional: false, analytics: true, session_insights: true })).toBe("session_insights");
  });

  it("maps categories to ledger purposes and receipts", () => {
    expect(toLedgerChoices(sample.categories)).toEqual({ analytics_cookies: true, session_insights: false, functional_cookies: true });
    expect(toReceiptCategories(sample.categories)).toEqual({ essential: true, analytics_cookies: true, session_insights: false, functional_cookies: true });
  });

  it("infers how a choice was made", () => {
    expect(inferConsentMethod({ functional: true, analytics: true, session_insights: true })).toBe("accept_all");
    expect(inferConsentMethod({ functional: false, analytics: false, session_insights: false })).toBe("reject_all");
    expect(inferConsentMethod({ functional: false, analytics: false, session_insights: false }, { previous: sample.categories })).toBe("withdrawn");
    expect(inferConsentMethod({ functional: false, analytics: true, session_insights: false })).toBe("custom");
    expect(inferConsentMethod({ functional: false, analytics: false, session_insights: false }, { viaGpcDefault: true })).toBe("browser_signal");
  });
});

describe("random ids", () => {
  it("generates ids accepted by the database CHECK", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRandomId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(isRandomId(id)).toBe(true);
    expect(isRandomId("short")).toBe(false);
    expect(isRandomId("ravi.kumar@example.com")).toBe(false);
  });
});
