import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { OrgContext } from "@/modules/identity/authz";

/**
 * Company / Travel Agency Portal dashboard counts against an isolated database (real rows, scoping to the member's
 * organisation, permission checks). Run with
 *   node scripts/test-db.mjs vsg_test_dashboard_employer
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_dashboard_employer npx vitest run "src/app/employer/(workspace)/_lib" --no-file-parallelism
 *   node scripts/test-db.mjs vsg_test_dashboard_employer --drop
 */
const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

const ALL = [
  "employer.dashboard",
  "employer.requirements.manage",
  "employer.pipeline.view",
  "employer.interviews.manage",
  "employer.offers.manage",
  "employer.billing.view",
];

describe.skipIf(!enabled)("employer dashboard queries (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  // Imported lazily: loading the queries opens the database pool.
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const q = await import("./dashboard-queries");

  await db.insert(s.currencies).values({ code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 }).onConflictDoNothing();

  async function makeOrg(permissions: string[]): Promise<OrgContext<"employer">> {
    const [org] = await db.insert(s.organizations).values({ type: "employer", name: `Dash ${randomUUID().slice(0, 6)}`, slug: `dash-${randomUUID()}`, status: "verified" }).returning();
    const [u] = await db.insert(s.users).values({ displayName: "Dash Tester", email: `dash-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date() }).returning();
    return {
      orgType: "employer",
      user: { id: u!.id, displayName: u!.displayName, email: u!.email, timezone: null } as OrgContext["user"],
      sessionId: "test-session",
      organization: org!,
      membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
      role: { id: randomUUID(), key: "owner", name: "Owner" },
      permissions: new Set(permissions),
      isOwner: true,
    };
  }

  async function addRequirement(organizationId: string, status: (typeof s.REQUIREMENT_STATUSES)[number], totalPositions: number) {
    await db.insert(s.requirementRequests).values({
      code: `VSG-REQ-${randomUUID().slice(0, 8)}`,
      organizationId,
      source: "employer_portal",
      title: `Welders ${status}`,
      contactName: "Dash Tester",
      totalPositions,
      status,
      submittedAt: status === "draft" ? null : new Date(),
    });
  }

  const ctx = await makeOrg(ALL);
  const other = await makeOrg(ALL);

  it("counts manpower requests by status, open requests and their positions, for this organisation only", async () => {
    await addRequirement(ctx.organization.id, "draft", 4);
    await addRequirement(ctx.organization.id, "submitted", 10);
    await addRequirement(ctx.organization.id, "sourcing", 6);
    await addRequirement(ctx.organization.id, "on_hold", 2);
    await addRequirement(ctx.organization.id, "filled", 8);
    await addRequirement(ctx.organization.id, "cancelled", 3);
    await addRequirement(other.organization.id, "submitted", 50);

    const summary = await q.getRequirementSummary(ctx);
    expect(summary).toMatchObject({ open: 3, openPositions: 18, drafts: 1, total: 6 });
    expect(summary.byStatus).toMatchObject({ draft: 1, submitted: 1, sourcing: 1, on_hold: 1, filled: 1, cancelled: 1, approved: 0 });

    const otherSummary = await q.getRequirementSummary(other);
    expect(otherSummary).toMatchObject({ open: 1, openPositions: 50, total: 1 });
  });

  it("counts only payable invoices of this organisation", async () => {
    const now = new Date();
    const party = { buyerSnapshot: { legalName: "Buyer" }, sellerSnapshot: { legalName: "Venkat Sai" } };
    await db.insert(s.invoices).values([
      { currency: "AED", organizationId: ctx.organization.id, code: `INV-${randomUUID().slice(0, 8)}`, status: "issued", subtotalMinor: 100000, totalMinor: 100000, issuedAt: now, ...party },
      { currency: "AED", organizationId: ctx.organization.id, code: `INV-${randomUUID().slice(0, 8)}`, status: "overdue", subtotalMinor: 50000, totalMinor: 50000, issuedAt: now, ...party },
      { currency: "AED", organizationId: ctx.organization.id, code: `INV-${randomUUID().slice(0, 8)}`, status: "paid", subtotalMinor: 70000, totalMinor: 70000, amountPaidMinor: 70000, issuedAt: now, paidAt: now, ...party },
      { currency: "AED", organizationId: ctx.organization.id, status: "draft", subtotalMinor: 9000, totalMinor: 9000 },
      { currency: "AED", organizationId: other.organization.id, code: `INV-${randomUUID().slice(0, 8)}`, status: "issued", subtotalMinor: 1000, totalMinor: 1000, issuedAt: now, ...party },
    ]);
    expect(await q.countUnpaidInvoices(ctx)).toBe(2);
    expect(await q.countUnpaidInvoices(other)).toBe(1);
  });

  it("returns zeros for interviews, offers and placements of an organisation without any", async () => {
    const week = { from: new Date(Date.now() - 3 * 86_400_000), to: new Date(Date.now() + 4 * 86_400_000) };
    expect(await q.countInterviewsBetween(ctx, week.from, week.to)).toBe(0);
    const offers = await q.countOffersByStatus(ctx);
    expect(Object.values(offers).every((n) => n === 0)).toBe(true);
    expect(Object.keys(offers)).toEqual(expect.arrayContaining(["draft", "issued", "accepted"]));
    const placements = await q.countPlacementsByStatus(ctx);
    expect(placements).toMatchObject({ joined: 0, mobilising: 0, pending_joining: 0, completed: 0 });
  });

  it("refuses members whose role does not cover the figure", async () => {
    const finance = await makeOrg(["employer.billing.view"]);
    await expect(q.getRequirementSummary(finance)).rejects.toThrow();
    await expect(q.countInterviewsBetween(finance, new Date(), new Date())).rejects.toThrow();
    await expect(q.countOffersByStatus(finance)).rejects.toThrow();
    await expect(q.countPlacementsByStatus(finance)).rejects.toThrow();
    expect(await q.countUnpaidInvoices(finance)).toBe(0);

    const hiring = await makeOrg(["employer.dashboard", "employer.pipeline.view"]);
    await expect(q.countUnpaidInvoices(hiring)).rejects.toThrow();
    expect(await q.getRequirementSummary(hiring)).toMatchObject({ total: 0 });
    expect(await q.countPlacementsByStatus(hiring)).toMatchObject({ joined: 0 });
  });
});
