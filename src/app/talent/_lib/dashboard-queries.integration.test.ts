/**
 * People Portal home reads against PostgreSQL (isolated test database only):
 *   node scripts/test-db.mjs vsg_test_dashboard_talent
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_dashboard_talent npx vitest run src/app/talent/_lib --no-file-parallelism
 * Every read must return only the signed-in job seeker's own data, and the phone number links website CVs and
 * bookings only once it is verified.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!enabled)("People Portal home data (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { asc, eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const fx = await import("@/modules/organizations/testing");
  const { seedDefaultWorkflow } = await import("@/modules/recruitment/seed");
  const q = await import("./dashboard-queries");

  const run = randomUUID().slice(0, 8);
  const runNumber = Number.parseInt(run.slice(0, 6), 16);
  const phoneOf = (n: number) => `+9197${String((runNumber * 10 + n) % 100_000_000).padStart(8, "0")}`;
  const DAY = 86_400_000;
  const iso = (from: string, days: number) => new Date(Date.parse(`${from}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  const TODAY = "2026-11-26";

  async function person(opts: { phone?: string; verified?: boolean } = {}) {
    const user = await fx.createUser({ displayName: "Ravi Kumar" });
    if (opts.phone) await db.update(s.users).set({ phone: opts.phone, phoneVerifiedAt: opts.verified ? new Date() : null }).where(eq(s.users.id, user.id));
    const { candidateId } = await fx.createCandidate(user);
    return { user: await fx.reloadUser(user.id), candidateId };
  }

  async function cv(phone: string, values: Partial<typeof s.cvSubmissions.$inferInsert> = {}) {
    const [row] = await db
      .insert(s.cvSubmissions)
      .values({ code: `VSG-CV-T${randomUUID().slice(0, 8)}`, name: "Ravi Kumar", phone, tradeLabel: "Pipe welder", consentToContact: true, ...values })
      .returning();
    return row!;
  }

  async function slot(values: Partial<typeof s.bookingSlots.$inferInsert> & { date: string }) {
    const [row] = await db
      .insert(s.bookingSlots)
      .values({ code: `VSG-SLT-T${randomUUID().slice(0, 8)}`, kind: "trade_test", title: "6G pipe welding test", trade: "Pipe welder", startTime: "09:30", venue: "Gajuwaka centre", capacity: 10, ...values })
      .returning();
    return row!;
  }

  async function booking(slotId: string, values: { phone: string; userId?: string | null; status?: "booked" | "attended" | "no_show" | "cancelled" }) {
    const [row] = await db
      .insert(s.slotBookings)
      .values({ code: `VSG-BKG-T${randomUUID().slice(0, 8)}`, slotId, name: "Ravi Kumar", phone: values.phone, trade: "Pipe welder", consentToContact: true, userId: values.userId ?? null, status: values.status ?? "booked" })
      .returning();
    return row!;
  }

  beforeAll(async () => {
    await fx.seedReferenceData();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("verifiedPhone links nothing until the number is verified", () => {
    expect(q.verifiedPhone({ phone: "+919000000001", phoneVerifiedAt: new Date() })).toBe("+919000000001");
    expect(q.verifiedPhone({ phone: "+919000000001", phoneVerifiedAt: null })).toBeNull();
    expect(q.verifiedPhone({ phone: null, phoneVerifiedAt: new Date() })).toBeNull();
  });

  it("lists website CVs by verified phone only, latest activity first", async () => {
    const phone = phoneOf(1);
    const { user } = await person({ phone, verified: true });
    const old = await cv(phone, { tradeLabel: "Fitter", createdAt: new Date(Date.now() - 40 * DAY) });
    const moved = await cv(phone, { status: "trade_test", candidateNote: "Bring safety shoes.", createdAt: new Date(Date.now() - 12 * DAY), statusChangedAt: new Date(Date.now() - 2 * DAY) });
    await cv(phoneOf(2), { tradeLabel: "Someone else" });

    const list = await q.listLinkedCvSubmissions(user, 5);
    expect(list.map((c) => c.id)).toEqual([moved.id, old.id]);
    expect(list[0]).toMatchObject({ status: "trade_test", candidateNote: "Bring safety shoes.", tradeLabel: "Pipe welder" });
    expect(list[0]!.updatedAt.getTime()).toBe(moved.statusChangedAt!.getTime());
    expect(list[1]!.updatedAt.getTime()).toBe(old.createdAt.getTime());
    expect(await q.listLinkedCvSubmissions(user, 1)).toHaveLength(1);

    // The same number typed but not verified unlocks nothing.
    const unverifiedPhone = phoneOf(3);
    const { user: unverified } = await person({ phone: unverifiedPhone, verified: false });
    await cv(unverifiedPhone);
    expect(await q.listLinkedCvSubmissions(unverified)).toEqual([]);
  });

  it("lists own bookings (account or verified phone), upcoming soonest first, never another person's", async () => {
    const phone = phoneOf(4);
    const { user } = await person({ phone, verified: true });
    const other = await person({ phone: phoneOf(5), verified: true });

    const soon = await slot({ date: iso(TODAY, 3) });
    const later = await slot({ date: iso(TODAY, 9), kind: "training", title: "Safety induction" });
    const past = await slot({ date: iso(TODAY, -5) });
    const cancelledSlot = await slot({ date: iso(TODAY, 4), status: "cancelled", cancelledAt: new Date() });

    const viaAccount = await booking(later.id, { phone: "+919999999999", userId: user.id });
    const viaPhone = await booking(soon.id, { phone });
    const attended = await booking(past.id, { phone, status: "attended" });
    const slotCancelled = await booking(cancelledSlot.id, { phone, userId: user.id });
    await booking(soon.id, { phone: phoneOf(5), userId: other.user.id });

    const result = await q.listOwnBookings(user, { today: TODAY, limit: 10 });
    expect(result.upcoming).toBe(2);
    expect(result.items.map((b) => b.id)).toEqual([viaPhone.id, viaAccount.id, slotCancelled.id, attended.id]);
    expect(result.items.map((b) => b.upcoming)).toEqual([true, true, false, false]);
    expect(result.items[1]!.slot).toMatchObject({ kind: "training", title: "Safety induction" });
    expect((await q.listOwnBookings(user, { today: TODAY, limit: 1 })).items).toHaveLength(1);

    // Without a verified phone only the bookings made while signed in count.
    await db.update(s.users).set({ phoneVerifiedAt: null }).where(eq(s.users.id, user.id));
    const unverified = await q.listOwnBookings(await fx.reloadUser(user.id), { today: TODAY, limit: 10 });
    expect(unverified.items.map((b) => b.id).sort()).toEqual([viaAccount.id, slotCancelled.id].sort());
  });

  it("counts own applications per India month over the last six months", async () => {
    const { workflowId } = await seedDefaultWorkflow();
    const [stage] = await db.select({ id: s.workflowStages.id }).from(s.workflowStages).where(eq(s.workflowStages.workflowId, workflowId)).orderBy(asc(s.workflowStages.sortOrder)).limit(1);
    const [org] = await db.insert(s.organizations).values({ type: "employer", name: `Month Test ${run}`, slug: `month-test-${run}`, status: "verified" }).returning();
    const me = await person();
    const someoneElse = await person();

    async function apply(candidateId: string, createdAt: Date) {
      const [job] = await db
        .insert(s.jobs)
        .values({ code: `VSG-JOB-T${randomUUID().slice(0, 8)}`, slug: `job-${randomUUID().slice(0, 8)}`, title: "Pipe welder", status: "published", publishedAt: new Date(), countryCode: "IN", organizationId: org!.id })
        .returning();
      await db.insert(s.applications).values({ code: `VSG-APP-T${randomUUID().slice(0, 8)}`, jobId: job!.id, candidateId, workflowId, currentStageId: stage!.id, createdAt });
    }

    const now = new Date("2026-11-26T06:00:00Z");
    await apply(me.candidateId, new Date("2026-11-20T10:00:00Z"));
    await apply(me.candidateId, new Date("2026-10-31T20:00:00Z")); // 1 November in India
    await apply(me.candidateId, new Date("2026-10-15T10:00:00Z"));
    await apply(me.candidateId, new Date("2026-04-15T10:00:00Z")); // older than six months
    await apply(someoneElse.candidateId, new Date("2026-11-21T10:00:00Z"));

    const rows = await q.countOwnApplicationsByMonth(me.candidateId, { months: 6, now });
    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r.value]));
    expect(byMonth).toEqual({ "2026-11": 2, "2026-10": 1 });
  });

  it("reminds about the own passport, documents and licences that expire soon or expired", async () => {
    const me = await person();
    const other = await person();
    const candidate = { id: me.candidateId, passportExpiry: iso(TODAY, 75) };
    const fileFor = (ownerUserId: string) => fx.createFileRow({ purpose: "candidate_document", ownerUserId });

    const [expiredVisa] = await db
      .insert(s.candidateDocuments)
      .values({ candidateId: me.candidateId, documentType: "visa", title: "Old visa", fileId: await fileFor(me.user.id), expiresAt: iso(TODAY, -3) })
      .returning();
    await db.insert(s.candidateDocuments).values({ candidateId: me.candidateId, documentType: "medical", fileId: await fileFor(me.user.id), expiresAt: iso(TODAY, 200) });
    await db.insert(s.candidateDocuments).values({ candidateId: me.candidateId, documentType: "police_clearance", fileId: await fileFor(me.user.id), expiresAt: iso(TODAY, 10), deletedAt: new Date() });
    await db.insert(s.candidateDocuments).values({ candidateId: other.candidateId, documentType: "visa", fileId: await fileFor(other.user.id), expiresAt: iso(TODAY, 5) });
    const [licence] = await db.insert(s.candidateCredentials).values({ candidateId: me.candidateId, credentialType: "licence", name: "  ", expiresAt: iso(TODAY, 20) }).returning();
    await db.insert(s.candidateCredentials).values({ candidateId: me.candidateId, credentialType: "certificate", name: "Far away", expiresAt: iso(TODAY, 100) });

    const reminders = await q.listOwnDocumentReminders(candidate, TODAY);
    expect(reminders.map((r) => [r.kind, r.state, r.expiresOn])).toEqual([
      ["document", "expired", iso(TODAY, -3)],
      ["credential", "soon", iso(TODAY, 20)],
      ["passport", "soon", iso(TODAY, 75)],
    ]);
    expect(reminders[0]).toMatchObject({ id: expiredVisa!.id, title: "Old visa", type: "visa" });
    expect(reminders[1]).toMatchObject({ id: licence!.id, title: null, type: "licence" });

    // A passport valid for more than six months is not a reminder; one without a date neither.
    expect((await q.listOwnDocumentReminders({ id: me.candidateId, passportExpiry: iso(TODAY, 400) }, TODAY)).some((r) => r.kind === "passport")).toBe(false);
    expect((await q.listOwnDocumentReminders({ id: me.candidateId, passportExpiry: null }, TODAY)).some((r) => r.kind === "passport")).toBe(false);
  });

  it("resolves preferred job category names", async () => {
    const [category] = await db.insert(s.jobCategories).values({ name: `Welding ${run}`, slug: `welding-${run}` }).returning();
    expect(await q.listCategoryNames([category!.id, randomUUID()])).toEqual([`Welding ${run}`]);
    expect(await q.listCategoryNames([])).toEqual([]);
  });
});
