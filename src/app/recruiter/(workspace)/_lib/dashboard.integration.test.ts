/**
 * Partner dashboard read model against an ISOLATED database: real counts, scoping to the caller's
 * organisation, the weekly series by time zone, settlement totals per currency and role gating.
 *   node scripts/test-db.mjs vsg_test_dashboard_recruiter
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_dashboard_recruiter'; npx vitest run "src/app/recruiter/(workspace)/_lib/dashboard.integration.test.ts"
 * Skipped unless DATABASE_URL points at a vsg_test_* database.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("partner dashboard read model (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { DEFAULT_ROLES, PARTNER_PERMISSIONS } = await import("@/config/permissions");
  const dash = await import("./dashboard");
  const { summarizeSettlements, weeklySeries } = await import("./dashboard-model");

  type OrgContext = import("@/modules/identity/authz").OrgContext<"recruitment_partner">;

  const run = randomUUID().slice(0, 8);
  const DAY = 86_400_000;
  // A fixed "today" (Thursday 26 Nov 2026, India time) keeps due dates and weeks deterministic.
  const now = new Date("2026-11-26T06:30:00Z");
  const todayIso = "2026-11-26";

  await db.insert(s.currencies).values([
    { code: "INR", name: "Indian rupee", symbol: "₹", minorUnits: 2 },
    { code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 },
  ]).onConflictDoNothing();
  await db.insert(s.countries).values([{ code: "IN", name: "India" }, { code: "AE", name: "United Arab Emirates" }]).onConflictDoNothing();

  async function makeUser(name: string) {
    const [row] = await db.insert(s.users).values({ displayName: name, email: `${name.toLowerCase().replace(/\W+/g, ".")}.${run}@vsg-test.invalid`, status: "active" }).returning();
    return row!;
  }
  async function makeOrg(type: "employer" | "recruitment_partner", name: string) {
    const [org] = await db.insert(s.organizations).values({ type, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`, status: "verified" }).returning();
    return org!;
  }
  function ctxFor(user: Awaited<ReturnType<typeof makeUser>>, organization: typeof s.organizations.$inferSelect, permissions: readonly string[]): OrgContext {
    return {
      orgType: "recruitment_partner",
      user: { id: user.id, email: user.email, phone: null, emailVerifiedAt: null, phoneVerifiedAt: null, displayName: user.displayName, avatarFileId: null, status: "active", isStaff: false, locale: "en", timezone: null, hasPassword: false, twoFactorEnabled: false },
      sessionId: `session-${user.id}`,
      organization,
      membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
      role: { id: randomUUID(), key: "owner", name: "Owner" },
      permissions: new Set(permissions),
      isOwner: true,
    } as OrgContext;
  }

  const owner = await makeUser("Dash Owner");
  const partner = await makeOrg("recruitment_partner", "Dash Partner");
  const otherPartner = await makeOrg("recruitment_partner", "Dash Other Partner");
  const employer = await makeOrg("employer", "Dash Employer");
  const [job] = await db
    .insert(s.jobs)
    .values({ code: `VSG-JOB-D${run}`, slug: `dash-welder-${run}`, title: "Dash Pipe Welder", status: "published", publishedAt: now, countryCode: "AE", organizationId: employer.id })
    .returning();

  const iso = (offsetDays: number) => new Date(Date.parse(`${todayIso}T00:00:00Z`) + offsetDays * DAY).toISOString().slice(0, 10);
  // Open with a due date in 3 days, open and overdue, open without a due date, paused; plus one for the other partner.
  const [dueSoon, overdue] = await db
    .insert(s.partnerAssignments)
    .values([
      { partnerOrganizationId: partner.id, jobId: job!.id, status: "active", dueDate: iso(3) },
      { partnerOrganizationId: partner.id, jobId: job!.id, status: "completed", dueDate: iso(-30) },
    ])
    .returning();
  const extraJobs = await db
    .insert(s.jobs)
    .values([1, 2, 3].map((n) => ({ code: `VSG-JOB-D${run}${n}`, slug: `dash-welder-${run}-${n}`, title: `Dash Job ${n}`, status: "published" as const, publishedAt: now, countryCode: "AE", organizationId: employer.id })))
    .returning();
  await db.insert(s.partnerAssignments).values([
    { partnerOrganizationId: partner.id, jobId: extraJobs[0]!.id, status: "active", dueDate: iso(-2) },
    { partnerOrganizationId: partner.id, jobId: extraJobs[1]!.id, status: "active", dueDate: null },
    { partnerOrganizationId: partner.id, jobId: extraJobs[2]!.id, status: "paused", dueDate: iso(1) },
    { partnerOrganizationId: otherPartner.id, jobId: job!.id, status: "active", dueDate: iso(2) },
  ]);

  // Submissions: statuses and creation times chosen across week boundaries in India time.
  const candidates = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const user = await makeUser(`Dash Candidate ${i}`);
      const [profile] = await db.insert(s.candidateProfiles).values({ userId: user.id, headline: "Welder" }).returning({ id: s.candidateProfiles.id });
      return { userId: user.id, candidateId: profile!.id };
    }),
  );
  const [consent] = await db.insert(s.consentRecords).values({ userId: candidates[2]!.userId, purpose: "partner_submission", granted: true, source: "test" }).returning();
  const sub = (i: number, status: (typeof s.partnerSubmissions.$inferInsert)["status"], createdAt: Date, extra: Partial<typeof s.partnerSubmissions.$inferInsert> = {}) => ({
    code: `VSG-SUB-D${run}${i}`,
    assignmentId: dueSoon!.id,
    partnerOrganizationId: partner.id,
    candidateId: candidates[i]!.candidateId,
    jobId: job!.id,
    status,
    createdAt,
    ...extra,
  });
  await db.insert(s.partnerSubmissions).values([
    // Monday 23 Nov 00:30 India time = Sunday 22 Nov 19:00 UTC: belongs to the week of 23 Nov in India.
    sub(0, "submitted", new Date("2026-11-22T19:00:00Z")),
    sub(1, "under_review", new Date("2026-11-25T08:00:00Z")),
    sub(2, "accepted", new Date("2026-11-03T08:00:00Z"), { consentRecordId: consent!.id }),
    sub(3, "rejected", new Date("2026-11-04T08:00:00Z")),
    sub(4, "duplicate", new Date("2026-08-01T08:00:00Z")), // outside the 8-week window
    sub(5, "withdrawn", new Date("2026-11-24T08:00:00Z")), // never counted in the chart
  ]);
  await db.insert(s.partnerSubmissions).values({ ...sub(0, "submitted", now), code: `VSG-SUB-D${run}x`, assignmentId: overdue!.id });

  await db.insert(s.partnerSettlements).values([
    { code: `VSG-STL-D${run}1`, partnerOrganizationId: partner.id, currency: "AED", periodStart: "2026-10-01", periodEnd: "2026-10-31", amountMinor: 200_000, withholdingTaxMinor: 20_000, status: "approved" },
    { code: `VSG-STL-D${run}2`, partnerOrganizationId: partner.id, currency: "AED", periodStart: "2026-09-01", periodEnd: "2026-09-30", amountMinor: 50_000, withholdingTaxMinor: 0, status: "pending_approval" },
    { code: `VSG-STL-D${run}3`, partnerOrganizationId: partner.id, currency: "INR", periodStart: "2026-08-01", periodEnd: "2026-08-31", amountMinor: 1_000_000, withholdingTaxMinor: 100_000, status: "paid", approvedAt: now, paidAt: now },
    { code: `VSG-STL-D${run}4`, partnerOrganizationId: partner.id, currency: "INR", periodStart: "2026-11-01", periodEnd: "2026-11-30", amountMinor: 999_999, withholdingTaxMinor: 0, status: "draft" },
    { code: `VSG-STL-D${run}5`, partnerOrganizationId: otherPartner.id, currency: "AED", periodStart: "2026-10-01", periodEnd: "2026-10-31", amountMinor: 70_000, withholdingTaxMinor: 0, status: "approved" },
  ]);

  it("counts open, due-this-week, overdue and paused requirements of the caller only", async () => {
    expect(await dash.countPartnerAssignments(partner.id, todayIso)).toEqual({ open: 3, paused: 1, dueThisWeek: 1, overdue: 1 });
    expect(await dash.countPartnerAssignments(otherPartner.id, todayIso)).toEqual({ open: 1, paused: 0, dueThisWeek: 1, overdue: 0 });
    expect(await dash.countPartnerAssignments(randomUUID(), todayIso)).toEqual({ open: 0, paused: 0, dueThisWeek: 0, overdue: 0 });
  });

  it("counts submissions per status", async () => {
    expect(await dash.countPartnerSubmissionsByStatus(partner.id)).toEqual({ submitted: 2, under_review: 1, accepted: 1, rejected: 1, duplicate: 1, withdrawn: 1 });
    expect(await dash.countPartnerSubmissionsByStatus(otherPartner.id)).toEqual({});
  });

  it("buckets submissions per week in the viewer's time zone, withdrawn left out", async () => {
    const rows = await dash.weeklyPartnerSubmissions(partner.id, todayIso, "Asia/Kolkata");
    const series = weeklySeries(rows, todayIso, 8);
    expect(series.at(-1)).toEqual({ label: "23 Nov", value: 3 }); // 22 Nov 19:00 UTC, 25 Nov and today
    expect(series.find((p) => p.label === "2 Nov")?.value).toBe(2);
    expect(series.reduce((n, p) => n + p.value, 0)).toBe(5);
    // In UTC the Sunday-evening submission falls in the previous week.
    const utc = weeklySeries(await dash.weeklyPartnerSubmissions(partner.id, todayIso, "UTC"), todayIso, 8);
    expect(utc.at(-1)?.value).toBe(2);
    expect(utc.find((p) => p.label === "16 Nov")?.value).toBe(1);
  });

  it("totals settlements the partner may see, per status and currency", async () => {
    const totals = await dash.partnerSettlementTotals(partner.id);
    const key = (r: { status: string; currency: string }) => `${r.status}:${r.currency}`;
    expect(Object.fromEntries(totals.map((r) => [key(r), [r.count, r.netMinor]]))).toEqual({
      "approved:AED": [1, 180_000],
      "pending_approval:AED": [1, 50_000],
      "paid:INR": [1, 900_000],
    });
    const summary = summarizeSettlements(totals, "en-IN");
    expect(summary.awaitingCount).toBe(2);
    expect(summary.awaitingAmounts).toHaveLength(1);
    expect(summary.awaitingAmounts[0]).toMatch(/AED/);
    expect(summary.awaitingAmounts[0]).toMatch(/2,300/);
    expect(summary.paidAmounts[0]).toMatch(/₹/);
  });

  it("loads every section for the owner and only the allowed ones for other roles", async () => {
    const all = await dash.loadPartnerDashboard(ctxFor(owner, partner, PARTNER_PERMISSIONS.map((p) => p.key)), "Asia/Kolkata", now);
    expect(all.todayIso).toBe(todayIso);
    expect(all.assignments?.counts.open).toBe(3);
    expect(all.assignments?.recent.every((a) => a.status === "active")).toBe(true);
    expect(all.submissions?.byStatus.accepted).toBe(1);
    expect(all.submissions?.recent.length).toBeGreaterThan(0);
    expect(all.submissions?.weekly).not.toBeNull();
    expect(all.interviews).toEqual({ upcoming: 0, next: [] });
    expect(all.documents).toMatchObject({ candidates: 0, openItems: 0 });
    expect(all.settlements?.recent.map((r) => r.status).sort()).toEqual(["approved", "paid", "pending_approval"]);
    expect(all.performance?.profilesSubmitted).toBe(6);
    expect(all.overview?.organization.id).toBe(partner.id);
    expect(all.agreements).toEqual([]);
    expect(all.licences).toEqual([]);
    expect(all.unreadMessages).toBe(0);

    const recruiterRole = DEFAULT_ROLES.find((r) => r.scope === "recruitment_partner" && r.key === "recruiter")!;
    const recruiter = await dash.loadPartnerDashboard(ctxFor(owner, partner, recruiterRole.permissions), "Asia/Kolkata", now);
    expect(recruiter.assignments).not.toBeNull();
    expect(recruiter.submissions).not.toBeNull();
    expect(recruiter.documents).not.toBeNull();
    expect(recruiter.settlements).toBeNull();
    expect(recruiter.performance).toBeNull();
    expect(recruiter.overview).toBeNull();
    expect(recruiter.agreements).toBeNull();

    const none = await dash.loadPartnerDashboard(ctxFor(owner, partner, ["partner.dashboard"]), "Asia/Kolkata", now);
    expect([none.assignments, none.submissions, none.interviews, none.documents, none.settlements, none.performance, none.overview, none.unreadMessages]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("shows an empty organisation honest zeros, never another partner's data", async () => {
    const empty = await makeOrg("recruitment_partner", "Dash Empty Partner");
    const data = await dash.loadPartnerDashboard(ctxFor(owner, empty, PARTNER_PERMISSIONS.map((p) => p.key)), "Asia/Kolkata", now);
    expect(data.assignments).toEqual({ counts: { open: 0, paused: 0, dueThisWeek: 0, overdue: 0 }, recent: [] });
    expect(data.submissions).toEqual({ byStatus: {}, recent: [], weekly: [] });
    expect(data.settlements).toEqual({ totals: [], recent: [] });
    expect(data.performance?.profilesSubmitted).toBe(0);
  });
});
