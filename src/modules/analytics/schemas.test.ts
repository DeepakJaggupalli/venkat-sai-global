import { describe, expect, it } from "vitest";

import { addDays, daysInclusive, enumerateDates, localDate, parseAnalyticsRange, percentChange, resolveAnalyticsRange } from "./range";
import { campaignFormSchema, collectPayloadSchema, consentReceiptSchema, funnelFormSchema, funnelStepSchema } from "./schemas";

const SID = "Abcdefghijklmnop_123";
const base = { v: 1 as const, sid: SID, sentAt: 1_700_000_000_000 };

describe("collectPayloadSchema", () => {
  it("accepts a well-formed batch and fills defaults", () => {
    const parsed = collectPayloadSchema.parse({
      ...base,
      vid: "Zyxwvutsrqponmlk_987",
      start: { landingPath: "/jobs", referrer: "www.google.com", utm: { source: "google" }, locale: "te", newVisitor: true },
      events: [{ name: "page_view", path: "/jobs", props: { page: "2" }, ts: 1_699_999_999_000 }],
    });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.heatmap).toEqual([]);
    expect(parsed.scroll).toEqual([]);
  });

  it("rejects empty batches, bad ids and bad event names", () => {
    expect(collectPayloadSchema.safeParse(base).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, sid: "someone@example.com", events: [{ name: "page_view", path: "/", ts: 1 }] }).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, events: [{ name: "Page View", path: "/", ts: 1 }] }).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, v: 2, events: [{ name: "page_view", path: "/", ts: 1 }] }).success).toBe(false);
  });

  it("enforces batch limits", () => {
    const events = Array.from({ length: 51 }, () => ({ name: "page_view", path: "/", ts: 1 }));
    expect(collectPayloadSchema.safeParse({ ...base, events }).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, events: events.slice(0, 50) }).success).toBe(true);
    const heatmap = Array.from({ length: 51 }, () => ({ path: "/", vw: "desktop", x: 10, y: 10, h: 100, kind: "click", ts: 1 }));
    expect(collectPayloadSchema.safeParse({ ...base, heatmap }).success).toBe(false);
    const scroll = Array.from({ length: 21 }, () => ({ path: "/", depth: 50, ts: 1 }));
    expect(collectPayloadSchema.safeParse({ ...base, scroll }).success).toBe(false);
  });

  it("validates heatmap coordinates and scroll depth", () => {
    const point = { path: "/", vw: "desktop", x: 10, y: 10, h: 100, kind: "click", ts: 1 };
    expect(collectPayloadSchema.safeParse({ ...base, heatmap: [{ ...point, x: 1001 }] }).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, heatmap: [{ ...point, h: 0 }] }).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, heatmap: [{ ...point, vw: "watch" }] }).success).toBe(false);
    expect(collectPayloadSchema.safeParse({ ...base, scroll: [{ path: "/", depth: 101, ts: 1 }] }).success).toBe(false);
  });
});

describe("consentReceiptSchema", () => {
  const receipt = {
    version: "1.2026-11-01",
    categories: { functional: false, analytics: true, session_insights: false },
    anonymousId: SID,
    method: "custom",
  };
  it("accepts a receipt and defaults the source", () => {
    expect(consentReceiptSchema.parse(receipt).source).toBe("cookie_banner");
  });
  it("rejects unknown methods, missing categories and bad ids", () => {
    expect(consentReceiptSchema.safeParse({ ...receipt, method: "maybe" }).success).toBe(false);
    expect(consentReceiptSchema.safeParse({ ...receipt, categories: { analytics: true } }).success).toBe(false);
    expect(consentReceiptSchema.safeParse({ ...receipt, anonymousId: "x" }).success).toBe(false);
  });
});

describe("admin forms", () => {
  it("validates campaign cost and dates", () => {
    expect(campaignFormSchema.safeParse({ utmCampaign: "Diwali", name: "Diwali", channel: "paid_social" }).success).toBe(true);
    expect(campaignFormSchema.parse({ utmCampaign: " Diwali-2026 ", name: "Diwali", channel: "paid_social" }).utmCampaign).toBe("diwali-2026");
    expect(campaignFormSchema.safeParse({ utmCampaign: "a@b", name: "x", channel: "email" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ utmCampaign: "x", name: "x", channel: "email", cost: "100" }).success).toBe(false);
    expect(campaignFormSchema.safeParse({ utmCampaign: "x", name: "x", channel: "email", cost: "100", currency: "aed" }).success).toBe(true);
    expect(campaignFormSchema.safeParse({ utmCampaign: "x", name: "x", channel: "email", startsOn: "2026-11-10", endsOn: "2026-11-01" }).success).toBe(false);
  });

  it("validates funnel steps", () => {
    expect(funnelStepSchema.safeParse({ label: "Jobs", path: "/jobs" }).success).toBe(true);
    expect(funnelStepSchema.safeParse({ label: "Jobs" }).success).toBe(false);
    expect(funnelStepSchema.safeParse({ label: "Jobs", path: "/jobs?x=1" }).success).toBe(false);
    expect(funnelStepSchema.safeParse({ label: "Reg", event: "registration_completed", props: { intent: "employer" } }).success).toBe(true);
    const steps = [
      { label: "A", event: "page_view" },
      { label: "B", event: "application_submitted" },
    ];
    expect(funnelFormSchema.safeParse({ name: "F", windowDays: "7", isActive: "on", steps }).success).toBe(true);
    expect(funnelFormSchema.safeParse({ name: "F", windowDays: "7", steps: steps.slice(0, 1) }).success).toBe(false);
    expect(funnelFormSchema.safeParse({ name: "F", windowDays: "400", steps }).success).toBe(false);
  });
});

describe("ranges", () => {
  const now = new Date("2026-11-07T20:00:00.000Z"); // 8 Nov 01:30 in Asia/Kolkata

  it("uses the reporting timezone's calendar day", () => {
    expect(localDate(now, "Asia/Kolkata")).toBe("2026-11-08");
    expect(localDate(now, "UTC")).toBe("2026-11-07");
    expect(localDate(now, "Not/AZone")).toBe("2026-11-07");
  });

  it("resolves presets with a previous period of equal length", () => {
    const r = resolveAnalyticsRange({ range: "7d" }, { now, timeZone: "Asia/Kolkata" });
    expect(r).toMatchObject({ from: "2026-11-02", to: "2026-11-08", days: 7, previousFrom: "2026-10-26", previousTo: "2026-11-01" });
    expect(resolveAnalyticsRange({ range: "today" }, { now, timeZone: "UTC" })).toMatchObject({ from: "2026-11-07", to: "2026-11-07", days: 1 });
    expect(resolveAnalyticsRange({ range: "yesterday" }, { now, timeZone: "UTC" })).toMatchObject({ from: "2026-11-06", to: "2026-11-06" });
    expect(resolveAnalyticsRange(undefined, { now, timeZone: "UTC" }).days).toBe(30);
  });

  it("clamps and repairs custom ranges", () => {
    const r = resolveAnalyticsRange({ range: "custom", from: "2026-12-31", to: "2026-11-01" }, { now, timeZone: "UTC" });
    expect(r).toMatchObject({ from: "2026-11-01", to: "2026-11-07" });
    const long = resolveAnalyticsRange({ range: "custom", from: "2020-01-01", to: "2026-11-07" }, { now, timeZone: "UTC" });
    expect(long.days).toBe(400);
    expect(resolveAnalyticsRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, { now, timeZone: "UTC" }).preset).toBe("30d");
    expect(parseAnalyticsRange({ range: "bogus" }, { now, timeZone: "UTC" }).preset).toBe("30d");
    expect(parseAnalyticsRange({ range: ["90d"] }, { now, timeZone: "UTC" }).days).toBe(90);
  });

  it("has correct date helpers", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysInclusive("2026-11-01", "2026-11-07")).toBe(7);
    expect(enumerateDates("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(percentChange(15, 10)).toBeCloseTo(0.5);
    expect(percentChange(5, 0)).toBeNull();
  });
});
