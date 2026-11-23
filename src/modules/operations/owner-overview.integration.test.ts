/**
 * Integration test for the owner overview aggregates against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_match
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_match npx vitest run src/modules/operations/owner-overview
 *   node scripts/test-db.mjs vsg_test_match --drop
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("Owner overview aggregates (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { CV_SUBMISSION_STATUSES } = await import("@/db/schema/cv-submissions");
  const { getOwnerOverview, parseOverviewPeriod } = await import("./owner-overview");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const ctx = (permissions: string[]) => ({ user: { id: randomUUID() }, roleKeys: [], permissions: new Set(permissions), isSuperAdmin: false }) as unknown as StaffContext;
  const day = 86_400_000;
  type Received = { currency: string; amountMinor: number; count: number }[];
  let base30: Received = [];
  let base90: Received = [];
  const delta = (now: Received, base: Received, currency: string) => {
    const a = now.find((r) => r.currency === currency) ?? { amountMinor: 0, count: 0 };
    const b = base.find((r) => r.currency === currency) ?? { amountMinor: 0, count: 0 };
    return { currency, amountMinor: a.amountMinor - b.amountMinor, count: a.count - b.count };
  };

  beforeAll(async () => {
    await db
      .insert(s.currencies)
      .values([
        { code: "INR", name: "Indian rupee", symbol: "₹" },
        { code: "AED", name: "UAE dirham", symbol: "AED" },
      ])
      .onConflictDoNothing();
    // Other suites share the database in a sequential run: measure against a baseline.
    const money = async (days: 30 | 90) => (await getOwnerOverview(ctx(["dashboard.view", "commercial.view"]), days)).money!.received;
    base30 = await money(30);
    base90 = await money(90);
    const tag = randomUUID().slice(0, 8);
    const pay = (n: number, currency: string, status: string, amountMinor: number, amountRefundedMinor: number, ageDays: number | null) => ({
      code: `VSG-PAY-T${tag}-${n}`,
      currency,
      provider: "manual" as const,
      status: status as never,
      amountMinor,
      amountRefundedMinor,
      receivedAt: ageDays == null ? null : new Date(Date.now() - ageDays * day),
    });
    await db.insert(s.payments).values([
      pay(1, "INR", "succeeded", 100_000, 0, 2),
      pay(2, "INR", "partially_refunded", 50_000, 20_000, 5),
      pay(3, "AED", "succeeded", 25_000, 0, 1),
      pay(4, "INR", "pending", 70_000, 0, null), // not received
      pay(5, "INR", "succeeded", 999_000, 0, 60), // outside 30 days, inside 90
      pay(6, "AED", "refunded", 10_000, 10_000, 3), // fully refunded: not revenue
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns money received per currency, net of refunds, never summed across currencies", async () => {
    const o = await getOwnerOverview(ctx(["dashboard.view", "commercial.view"]), 30);
    expect(delta(o.money!.received, base30, "AED")).toEqual({ currency: "AED", amountMinor: 25_000, count: 1 });
    expect(delta(o.money!.received, base30, "INR")).toEqual({ currency: "INR", amountMinor: 130_000, count: 2 });
    // One row per currency, never a combined total.
    expect(new Set(o.money!.received.map((r) => r.currency)).size).toBe(o.money!.received.length);
    expect(Array.isArray(o.money!.outstanding)).toBe(true);
    const o90 = await getOwnerOverview(ctx(["dashboard.view", "commercial.view"]), 90);
    expect(delta(o90.money!.received, base90, "INR")).toEqual({ currency: "INR", amountMinor: 1_129_000, count: 3 });
  });

  it("returns honest numbers for every card and hides money without commercial.view", async () => {
    const o = await getOwnerOverview(ctx(["dashboard.view"]), parseOverviewPeriod("7"));
    expect(o.days).toBe(7);
    expect(o.money).toBeNull();
    expect(o.cvs.byStatus.map((r) => r.status)).toEqual([...CV_SUBMISSION_STATUSES]);
    for (const v of [o.cvs.total, o.posters.published, o.posters.open, o.requirements.open, o.requirements.filled, o.recruitment.applications, o.recruitment.placements, o.recruitment.departed, o.training.enrolments, o.resumeRequests]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(parseOverviewPeriod("365")).toBe(30);
    await expect(getOwnerOverview(ctx(["commercial.view"]), 30)).rejects.toThrow();
  });
});
