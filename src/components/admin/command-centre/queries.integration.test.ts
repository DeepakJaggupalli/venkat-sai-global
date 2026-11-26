/**
 * Integration test for the Command Centre home figures against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_dashboard_admin
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_dashboard_admin npx vitest run src/components/admin/command-centre
 *   node scripts/test-db.mjs vsg_test_dashboard_admin --drop
 */
import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("Command Centre home figures (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { PLATFORM_PERMISSIONS } = await import("@/config/permissions");
  const { getCommandCentreSnapshot, CHART_DAYS } = await import("./queries");
  const { istDate } = await import("./config");
  type StaffContext = import("@/modules/identity/authz").StaffContext;
  type Snapshot = Awaited<ReturnType<typeof getCommandCentreSnapshot>>;

  const ctx = (permissions: readonly string[]) =>
    ({ user: { id: randomUUID() }, roleKeys: [], permissions: new Set(permissions), isSuperAdmin: false }) as unknown as StaffContext;
  const ALL = PLATFORM_PERMISSIONS.map((p) => p.key);
  const OWNER = ctx(ALL);
  const NO_GRIEVANCES = ctx(ALL.filter((p) => p !== "support.grievances"));
  const DAY = 86_400_000;
  const RUN = randomUUID().slice(0, 8);
  const phone = () => `+9198${String(randomInt(10_000_000, 99_999_999))}`;
  const code = (prefix: string) => `${prefix}-${RUN}-${randomInt(1e5, 1e6)}`;
  let before: Snapshot;
  let posterId = "";
  let slotId = "";

  beforeAll(async () => {
    await db.insert(s.countries).values({ code: "QA", name: "Qatar", isDestination: true }).onConflictDoNothing();
    before = await getCommandCentreSnapshot(OWNER);

    const [poster] = await db
      .insert(s.cmsEntries)
      .values({
        collection: "requirement_posts",
        slug: `welders-qatar-${RUN}`,
        title: `Welders for Qatar ${RUN}`,
        status: "published",
        publishedAt: new Date(),
        publishedVersion: 1,
        currentVersion: 1,
        data: { countryCode: "QA", applyBy: "2099-12-31", trades: [{ trade: "Pipe fitter" }] },
      })
      .returning();
    posterId = poster!.id;
    const cv = (name: string, tradeLabel: string, ageDays: number, extra: Partial<typeof s.cvSubmissions.$inferInsert> = {}) => ({
      code: code("VSG-CV"),
      name,
      phone: phone(),
      tradeLabel,
      consentToContact: true,
      createdAt: new Date(Date.now() - ageDays * DAY),
      ...extra,
    });
    const [departed] = await db
      .insert(s.cvSubmissions)
      .values([
        cv("Ravi Kumar", "Pipe fitter", 0, { status: "departed" }),
        cv("Suresh Babu", "Pipe fitter", 0),
        cv("Anil Rao", "pipe fitter ", 3, { passportExpiry: istDate(new Date(), -60) }),
        cv("Kiran Teja", "Electrician", 20, { status: "contacted" }),
        cv("Old Applicant", "Rigger", 45),
        cv("Poster Applicant", "Pipe fitter", 0, { requirementEntryId: posterId, requirementTitle: poster!.title }),
      ])
      .returning();
    await db
      .insert(s.workerReviews)
      .values({
        cvSubmissionId: departed!.id,
        displayName: "Ravi K.",
        trade: "Pipe fitter",
        countryCode: "QA",
        rating: 5,
        body: "Good support.",
        consentToPublish: true,
        status: "pending",
      });

    const venueDay = (offset: number) => istDate(new Date(), -offset);
    const [slot] = await db
      .insert(s.bookingSlots)
      .values([
        {
          code: code("VSG-SLT"),
          kind: "trade_test",
          title: `6G test ${RUN}`,
          trade: "Pipe welder 6G",
          date: venueDay(5),
          startTime: "09:30",
          venue: "Office",
          capacity: 10,
          bookedSeats: 3,
        },
        {
          code: code("VSG-SLT"),
          kind: "training",
          title: `Past ${RUN}`,
          trade: "Rigger",
          date: venueDay(-2),
          startTime: "09:30",
          venue: "Office",
          capacity: 10,
          bookedSeats: 4,
        },
        {
          code: code("VSG-SLT"),
          kind: "training",
          title: `Cancelled ${RUN}`,
          trade: "Rigger",
          date: venueDay(4),
          startTime: "09:30",
          venue: "Office",
          capacity: 10,
          bookedSeats: 0,
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "Trainer unwell",
        },
      ])
      .returning();
    slotId = slot!.id;
    await db
      .insert(s.slotBookings)
      .values({
        code: code("VSG-BKG"),
        slotId,
        name: "Agency contact",
        phone: phone(),
        trade: "Pipe welder",
        organizationName: `Gulf Travels ${RUN}`,
        seats: 3,
        consentToContact: true,
      });

    await db.insert(s.enquiries).values([
      { code: code("VSG-ENQ"), name: "General person", phone: phone(), message: "Need 20 welders", type: "employer" },
      { code: code("VSG-ENQ"), name: "Grievance person", phone: phone(), message: "Complaint", type: "grievance" },
      { code: code("VSG-ENQ"), name: "Spam person", phone: phone(), message: "Buy now", type: "general", status: "spam" },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("counts new CVs today and this week in India time, and the daily chart", async () => {
    const now = await getCommandCentreSnapshot(OWNER);
    expect(now.cvs!.today - before.cvs!.today).toBe(3);
    expect(now.cvs!.week - before.cvs!.week).toBe(4);
    expect(now.cvs!.toCallBack - before.cvs!.toCallBack).toBe(4);
    expect(now.cvs!.expiringPassports - before.cvs!.expiringPassports).toBe(1);
    expect(now.cvs!.perDay).toHaveLength(CHART_DAYS);
    expect(now.cvs!.perDay.at(-1)!.day).toBe(istDate(new Date()));
    expect(now.cvs!.perDay.at(-1)!.value - before.cvs!.perDay.at(-1)!.value).toBe(3);
    const total = (x: Snapshot) => x.cvs!.perDay.reduce((a, d) => a + d.value, 0);
    expect(total(now) - total(before)).toBe(4);
  });

  it("groups trades by name (case and spaces ignored), top first, inside the last 30 days", async () => {
    const now = await getCommandCentreSnapshot(OWNER);
    const pipe = now.cvs!.byTrade.find((t) => t.trade.toLowerCase() === "pipe fitter");
    const pipeBefore = before.cvs!.byTrade.find((t) => t.trade.toLowerCase() === "pipe fitter")?.count ?? 0;
    expect(pipe!.count - pipeBefore).toBe(4);
    const rigger = (x: Snapshot) => x.cvs!.byTrade.find((t) => t.trade === "Rigger")?.count ?? 0;
    expect(rigger(now)).toBe(rigger(before)); // 45 days old: outside the window
    expect(now.cvs!.byTrade.length).toBeLessThanOrEqual(8);
    const counts = now.cvs!.byTrade.map((t) => t.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(now.cvs!.tradeWindowTotal - before.cvs!.tradeWindowTotal).toBe(5);
  });

  it("lists live posters with their applicants, upcoming dates with seats, and work waiting", async () => {
    const now = await getCommandCentreSnapshot(OWNER);
    expect(now.posters!.open - before.posters!.open).toBe(1);
    expect(now.posters!.items.find((p) => p.id === posterId)).toMatchObject({ applicants: 1, applicantsWeek: 1, country: "Qatar" });

    expect(now.bookings!.upcoming - before.bookings!.upcoming).toBe(1);
    expect(now.bookings!.bookedSeats - before.bookings!.bookedSeats).toBe(3);
    expect(now.bookings!.freeSeats - before.bookings!.freeSeats).toBe(7);
    expect(now.bookings!.next.find((x) => x.id === slotId)).toMatchObject({ capacity: 10, bookedSeats: 3, startTime: "09:30", status: "open" });
    expect(now.bookings!.next.some((x) => x.title.startsWith("Past") || x.title.startsWith("Cancelled"))).toBe(false);

    expect(now.candidateCare!.reviewsPending - before.candidateCare!.reviewsPending).toBe(1);
    expect(now.leads!.newEnquiries - before.leads!.newEnquiries).toBe(2);
    expect(now.money).not.toBeNull();
    expect(now.setup!.cvs - before.setup!.cvs).toBe(6);
  });

  it("merges the latest CVs, bookings and enquiries, newest first, without spam", async () => {
    const now = await getCommandCentreSnapshot(OWNER);
    const kinds = new Set(now.activity.map((a) => a.kind));
    expect(kinds).toEqual(new Set(["cv", "booking", "enquiry"]));
    expect(now.activity.length).toBeLessThanOrEqual(8);
    const times = now.activity.map((a) => a.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(now.activity.some((a) => a.title.startsWith("Spam"))).toBe(false);
    expect(now.activity.find((a) => a.kind === "booking")).toMatchObject({ title: `Gulf Travels ${RUN} (3 seats)`, href: `/admin/bookings/${slotId}` });
    for (const a of now.activity) expect(a.href).toMatch(/^\/admin\/(cv-submissions|bookings|leads\/enquiries)\/[0-9a-f-]{36}$/);
  });

  it("hides grievance enquiries from staff who do not handle grievances", async () => {
    const owner = await getCommandCentreSnapshot(OWNER);
    const staff = await getCommandCentreSnapshot(NO_GRIEVANCES);
    expect(owner.leads!.newEnquiries - staff.leads!.newEnquiries).toBeGreaterThanOrEqual(1);
    expect(staff.activity.some((a) => a.title.startsWith("Grievance"))).toBe(false);
    expect(staff.support!.grievances).toBeNull();
    expect(owner.support!.grievances).not.toBeNull();
  });

  it("loads only what the viewer may open", async () => {
    const recruiterLike = await getCommandCentreSnapshot(ctx(["candidates.view"]));
    expect(recruiterLike.cvs).not.toBeNull();
    for (const key of ["candidateCare", "posters", "requirements", "bookings", "jobs", "support", "leads", "money", "orgs", "setup"] as const)
      expect(recruiterLike[key], key).toBeNull();
    expect(recruiterLike.approvalsOpen).toBeNull();
    expect(recruiterLike.placements30d).toBeNull();
    expect(new Set(recruiterLike.activity.map((a) => a.kind))).toEqual(new Set(["cv"]));

    const finance = await getCommandCentreSnapshot(ctx(["commercial.view", "orgs.view"]));
    expect(finance.cvs).toBeNull();
    expect(finance.money).not.toBeNull();
    expect(finance.orgs).not.toBeNull();
    expect(finance.activity).toEqual([]);

    const nobody = await getCommandCentreSnapshot(ctx([]));
    expect(nobody.tasks).toEqual({ open: 0, overdue: 0 });
    expect(nobody.activity).toEqual([]);
    expect(nobody.partial).toBe(false);
    expect(Object.entries(nobody).filter(([k, v]) => v !== null && !["access", "generatedAt", "partial", "tasks", "activity"].includes(k))).toEqual([]);
    expect((await getCommandCentreSnapshot(OWNER)).partial).toBe(false);
  });
});
