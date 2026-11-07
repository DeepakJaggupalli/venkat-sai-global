import { describe, expect, it } from "vitest";

import { aggregateFeature, evaluateCounted, evaluateCredit, lowCreditThreshold, type FeatureRow } from "./entitlement-rules";
import { dueLots, LOT_REFERENCE_TYPE, simulateLots, subscriptionLots, type LedgerEntry } from "./lots";
import { addMonthsUtc, billingPeriodEnd, calendarMonth, featureWindow, windowContaining } from "./periods";

const d = (iso: string) => new Date(iso);

describe("billing periods", () => {
  it("adds months with end-of-month clamping, counted from the anchor", () => {
    const anchor = d("2026-01-31T10:00:00Z");
    expect(addMonthsUtc(anchor, 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonthsUtc(anchor, 2).toISOString()).toBe("2026-03-31T10:00:00.000Z");
    expect(addMonthsUtc(d("2028-01-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(addMonthsUtc(anchor, -2).toISOString()).toBe("2025-11-30T10:00:00.000Z");
    expect(billingPeriodEnd(anchor, "quarter")!.toISOString()).toBe("2026-04-30T10:00:00.000Z");
    expect(billingPeriodEnd(anchor, "one_time")).toBeNull();
  });

  it("finds the window that contains a moment", () => {
    const anchor = d("2026-01-31T10:00:00Z");
    expect(windowContaining(anchor, 1, d("2026-03-15T00:00:00Z"))).toEqual({ start: d("2026-02-28T10:00:00Z"), end: d("2026-03-31T10:00:00Z") });
    expect(windowContaining(anchor, 1, d("2026-03-31T10:00:00Z")).start).toEqual(d("2026-03-31T10:00:00Z"));
    expect(windowContaining(anchor, 1, d("2026-03-31T09:59:59Z")).start).toEqual(d("2026-02-28T10:00:00Z"));
    expect(featureWindow(anchor, "year", d("2027-06-01T00:00:00Z"))).toEqual({ start: d("2027-01-31T10:00:00Z"), end: d("2028-01-31T10:00:00Z") });
    expect(windowContaining(anchor, 1, d("2025-12-01T00:00:00Z")).start).toEqual(anchor);
    expect(calendarMonth(d("2026-11-07T12:00:00Z"))).toEqual({ start: d("2026-11-01T00:00:00Z"), end: d("2026-12-01T00:00:00Z") });
  });
});

let seq = 0;
function entry(delta: number, reason: LedgerEntry["reason"], extra: Partial<LedgerEntry> = {}): LedgerEntry {
  seq += 1;
  return { id: `e${seq}`, seq, delta, reason, expiresAt: null, referenceType: null, referenceId: null, ...extra };
}

describe("credit lots", () => {
  it("draws earliest-expiring credits first and expires exactly the unused part", () => {
    seq = 0;
    const grant = entry(10, "plan_grant", { expiresAt: d("2026-12-01T00:00:00Z"), referenceType: "subscription", referenceId: "sub1" });
    const pack = entry(5, "purchase", { referenceType: "invoice", referenceId: "inv1" });
    const used = entry(-7, "consumption");
    const state = simulateLots([grant, pack, used]);
    expect(state.balance).toBe(8);
    expect(state.lots.map((l) => [l.id, l.remaining])).toEqual([
      ["e1", 3],
      ["e2", 5],
    ]);
    expect(dueLots(state, d("2026-11-30T00:00:00Z"))).toEqual([]);
    expect(dueLots(state, d("2026-12-01T00:00:00Z")).map((l) => [l.id, l.remaining])).toEqual([["e1", 3]]);
    const expiry = entry(-3, "expiry", { referenceType: LOT_REFERENCE_TYPE, referenceId: "e1" });
    const after = simulateLots([grant, pack, used, expiry]);
    expect(after.balance).toBe(5);
    expect(dueLots(after, d("2027-01-01T00:00:00Z"))).toEqual([]);
    expect(subscriptionLots(after, "sub1")).toEqual([]);
  });

  it("turns unenforced overdraft into debt that the next grant pays off", () => {
    seq = 0;
    const state = simulateLots([entry(2, "plan_grant"), entry(-5, "consumption")]);
    expect(state).toMatchObject({ debt: 3, balance: -3 });
    const forgiven = simulateLots([entry(2, "plan_grant"), entry(-5, "consumption"), entry(3, "adjustment"), entry(10, "plan_grant", { id: "g2" })]);
    expect(forgiven.balance).toBe(10);
    expect(forgiven.lots.find((l) => l.id === "g2")!.remaining).toBe(10);
  });

  it("lists open subscription lots for expiry at subscription end", () => {
    seq = 0;
    const state = simulateLots([entry(4, "plan_grant", { referenceType: "subscription", referenceId: "s" }), entry(-1, "consumption")]);
    expect(subscriptionLots(state, "s").map((l) => l.remaining)).toEqual([3]);
  });
});

const row = (limitValue: number | null, extra: Partial<FeatureRow> = {}): FeatureRow => ({
  planId: "p",
  planName: "Growth",
  planKind: "base",
  limitValue,
  period: "none",
  isDefaultPlan: false,
  ...extra,
});

describe("entitlement rules", () => {
  it("sums limits across base and add-on plans; any unlimited plan makes it unlimited", () => {
    expect(aggregateFeature([row(5), row(3, { planKind: "add_on", planName: "Extra seats" })])).toMatchObject({ included: true, limit: 8, planName: "Growth" });
    expect(aggregateFeature([row(5), row(null, { planKind: "add_on" })]).limit).toBeNull();
    expect(aggregateFeature([], ["Starter"])).toMatchObject({ included: false, hasPlan: true, planName: "Starter" });
    expect(aggregateFeature([])).toMatchObject({ included: false, hasPlan: false });
  });

  it("counted keys: enforcement off always allows, on compares live usage with the limit", () => {
    const feature = aggregateFeature([row(2)]);
    expect(evaluateCounted({ key: "job_posts", enforce: false, feature, used: 9, window: null })).toMatchObject({ allowed: true, limit: 2, used: 9, remaining: 0 });
    expect(evaluateCounted({ key: "job_posts", enforce: true, feature, used: 1, window: null })).toMatchObject({ allowed: true, remaining: 1 });
    const blocked = evaluateCounted({ key: "job_posts", enforce: true, feature, used: 2, window: null });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/includes 2 job posts and 2 are in use/);
    const periodic = evaluateCounted({ key: "bulk_requirements", enforce: true, feature, used: 2, window: { start: d("2026-11-01Z"), end: d("2026-12-01Z") } });
    expect(periodic.reason).toMatch(/resets on 2026-12-01/);
    const none = evaluateCounted({ key: "courses", enforce: true, feature: aggregateFeature([]), used: 0, window: null });
    expect(none).toMatchObject({ allowed: false, limit: 0 });
    expect(none.reason).toMatch(/does not have an active plan/);
  });

  it("credit keys: balance decides; unlimited features always allow; reasons explain the upgrade", () => {
    const feature = aggregateFeature([row(10, { period: "month" })]);
    const window = { start: d("2026-11-01Z"), end: d("2026-12-01Z") };
    expect(evaluateCredit({ key: "candidate_unlocks", enforce: true, feature, balance: 3, usedInWindow: 7, window })).toMatchObject({ allowed: true, limit: 10, used: 7, remaining: 3 });
    const empty = evaluateCredit({ key: "candidate_unlocks", enforce: true, feature, balance: 0, usedInWindow: 10, window });
    expect(empty.allowed).toBe(false);
    expect(empty.reason).toMatch(/no candidate unlock credits left.*resets on 2026-12-01/);
    expect(evaluateCredit({ key: "candidate_unlocks", enforce: false, feature, balance: -4, usedInWindow: 14, window })).toMatchObject({ allowed: true, remaining: 0 });
    expect(evaluateCredit({ key: "candidate_search", enforce: true, feature: aggregateFeature([row(null)]), balance: -50, usedInWindow: 50, window: null })).toMatchObject({ allowed: true, limit: null });
    const notIncluded = evaluateCredit({ key: "analytics_reports", enforce: true, feature: aggregateFeature([], ["Starter"]), balance: 0, usedInWindow: 0, window: null });
    expect(notIncluded.reason).toMatch(/does not include advanced reports/);
    // Purchased credits work even when the plan does not include the feature.
    expect(evaluateCredit({ key: "candidate_unlocks", enforce: true, feature: aggregateFeature([], ["Starter"]), balance: 2, usedInWindow: 0, window: null }).allowed).toBe(true);
    expect(lowCreditThreshold(50, 0.1)).toBe(5);
    expect(lowCreditThreshold(null, 0.1)).toBe(1);
  });
});
