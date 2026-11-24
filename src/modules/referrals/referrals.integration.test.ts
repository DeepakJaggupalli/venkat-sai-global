/**
 * Refer a friend (links, the /r/<CODE> cookie, "Check my referrals", payouts, staff lists) against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_t_referrals
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_referrals npx vitest run src/modules/referrals --no-file-parallelism
 *   node scripts/test-db.mjs vsg_t_referrals --drop
 */
import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /\/vsg_(?:t|test|r)_[a-z0-9_]+(?:\?|$)/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("Refer a friend (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_t_* / vsg_test_* / vsg_r_* database", () => undefined);
    return;
  }

  const { and, eq, inArray } = await import("drizzle-orm");
  const { NextRequest } = await import("next/server");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const svc = await import("./service");
  const { generateReferralCode } = await import("./codes");
  const q = await import("./queries");
  const { referralCheckSchema, referrerLinkSchema, markReferralPaidSchema, referralFiltersSchema } = await import("./schemas");
  const { GET: referralRoute } = await import("@/app/(public)/r/[code]/route");
  type StaffContext = import("@/modules/identity/authz").StaffContext;
  type CvStatus = (typeof s.cvSubmissions.$inferSelect)["status"];

  const page = { page: 1, pageSize: 50, offset: 0 };
  const phone = () => `+9198${String(randomInt(0, 1e8)).padStart(8, "0")}`;
  const ip = () => `ip-${randomUUID()}`;

  beforeAll(async () => {
    await db
      .insert(s.currencies)
      .values([
        { code: "INR", name: "Indian rupee", symbol: "₹", minorUnits: 2 },
        { code: "AED", name: "UAE dirham", symbol: "AED", minorUnits: 2 },
        { code: "KWD", name: "Kuwaiti dinar", symbol: "KWD", minorUnits: 3 },
        { code: "SAR", name: "Saudi riyal", symbol: "SAR", minorUnits: 2, isActive: false },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Referral staff", email: `r-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    return {
      user: { id: u!.id, email: u!.email, phone: null, emailVerifiedAt: u!.emailVerifiedAt, phoneVerifiedAt: null, displayName: u!.displayName, avatarFileId: null, status: u!.status, isStaff: true, locale: u!.locale, timezone: null, hasPassword: false, twoFactorEnabled: false },
      roleKeys: ["test"],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  async function newReferrer(name = "Ravi Kumar") {
    const input = referrerLinkSchema.parse({ name, phone: phone(), consentToContact: "true" });
    const link = await svc.getReferrerLink(input, { ipHash: ip() });
    const [row] = await db.select().from(s.referrers).where(eq(s.referrers.code, link.code));
    return { input, link, row: row! };
  }

  async function referredCv(code: string | null, opts: { name?: string; status?: CvStatus; phone?: string } = {}) {
    const [row] = await db
      .insert(s.cvSubmissions)
      .values({
        code: `VSG-CV-${String(randomInt(1e6, 1e7))}`,
        name: opts.name ?? "Suresh Babu Naidu",
        phone: opts.phone ?? phone(),
        tradeLabel: "Pipe fitter",
        consentToContact: true,
        referralCode: code,
        status: opts.status ?? "received",
      })
      .returning();
    return row!;
  }

  it("creates a referrer with a generated code, and gives the same link back to the same person", async () => {
    const { input, link, row } = await newReferrer("K. Ravi Kumar");
    expect(link).toMatchObject({ firstName: "Ravi", returning: false });
    expect(link.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    expect(link.url).toMatch(new RegExp(`/r/${link.code}$`));
    expect(row).toMatchObject({ name: "K. Ravi Kumar", phone: input.phone, status: "active", privacyNoticeVersion: expect.any(String) });
    expect(row.ipHash).toMatch(/^ip-/);

    const again = await svc.getReferrerLink({ ...input, name: "ravi kumar" }, { ipHash: ip() });
    expect(again).toEqual({ ...link, returning: true });
    expect(await db.select().from(s.referrers).where(eq(s.referrers.phone, input.phone))).toHaveLength(1);

    // A stranger who only knows the number does not get the link, not even by guessing a common surname.
    await expect(svc.getReferrerLink({ ...input, name: "Somebody Else" }, { ipHash: ip() })).rejects.toMatchObject({ code: "name_mismatch", fieldErrors: { name: [expect.any(String)] } });
    await expect(svc.getReferrerLink({ ...input, name: "Kumar" }, { ipHash: ip() })).rejects.toMatchObject({ code: "name_mismatch" });

    // A blocked referrer gets the paused message, not the link.
    const staff = await makeStaff(["candidates.manage"]);
    await svc.setReferrerStatus(staff, { id: row.id, status: "blocked" });
    await expect(svc.getReferrerLink(input, { ipHash: ip() })).rejects.toMatchObject({ code: "blocked", message: svc.REFERRAL_PAUSED_ERROR });
    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, row.id), eq(s.auditLogs.entityType, "referrer")));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["referrer.created", "referrer.blocked"]));
  });

  it("drops honeypot submissions and rate-limits per number", async () => {
    const input = referrerLinkSchema.parse({ name: "Bot", phone: phone(), consentToContact: "true", website: "spam.example" });
    await expect(svc.getReferrerLink(input, { ipHash: ip() })).rejects.toMatchObject({ message: svc.REFERRAL_LINK_ERROR });
    expect(await db.select().from(s.referrers).where(eq(s.referrers.phone, input.phone))).toHaveLength(0);

    const { input: real } = await newReferrer("Prasad Rao");
    for (let i = 0; i < 4; i++) await svc.getReferrerLink(real, { ipHash: ip() });
    await expect(svc.getReferrerLink(real, { ipHash: ip() })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("retries a code collision with a new code and never creates two referrers for one number", async () => {
    const taken = await newReferrer("Code Owner");
    const fresh = generateReferralCode();
    const codes = [taken.link.code, taken.link.code, fresh];
    const created = await svc.insertReferrer({ name: "Second Person", phone: phone() }, () => codes.shift()!);
    expect(created?.code).toBe(fresh);
    expect(codes).toHaveLength(0);
    // Same number at the same moment: no second row, the caller reads the first one.
    expect(await svc.insertReferrer({ name: "Double tap", phone: taken.row.phone })).toBeNull();
    await expect(db.insert(s.referrers).values({ name: "Dup", phone: phone(), code: taken.link.code })).rejects.toThrow();
  });

  it("sets the referral cookie only for an active code, and always lands on the homepage", async () => {
    const { link, row } = await newReferrer("Cookie Person");
    const call = (code: string) => referralRoute(new NextRequest(`http://localhost:3000/r/${encodeURIComponent(code)}`), { params: Promise.resolve({ code }) });

    const ok = await call(link.code.toLowerCase());
    expect(ok.status).toBe(307);
    expect(ok.headers.get("location")).toBe("/");
    expect(ok.headers.get("cache-control")).toMatch(/no-store/);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^vsg_ref=${link.code};`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);

    for (const bad of ["NOPE99", "x", "<script>"]) {
      const res = await call(bad);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("/");
      expect(res.headers.get("set-cookie")).toBeNull();
    }

    expect(await svc.resolveReferralLanding(link.code, { production: true })).toMatchObject({ value: link.code, options: { secure: true } });
    await svc.setReferrerStatus(await makeStaff(["candidates.manage"]), { id: row.id, status: "blocked" });
    expect((await call(link.code)).headers.get("set-cookie")).toBeNull();
    expect(await svc.findActiveReferrerByCode(link.code)).toBeNull();
  });

  it("shows the referrer only first names, trades, stages and reward status, after an exact number + code match", async () => {
    const { input, link, row } = await newReferrer("Anil Varma");
    const placed = await referredCv(link.code, { name: "Suresh Babu Naidu", status: "departed" });
    await referredCv(link.code, { name: "MOHAN RAO", status: "trade_test" });
    await referredCv(link.code, { name: "Kiran", status: "not_suitable" });
    await referredCv(null, { name: "Not Referred" });

    const check = referralCheckSchema.parse({ phone: input.phone.replace("+91", ""), code: link.url });
    const view = await svc.lookupMyReferrals(check, { ipHash: ip() });
    expect(view).toMatchObject({ firstName: "Anil", code: link.code, url: link.url, active: true, counts: { total: 3, placed: 1, due: 1, paid: 0 } });
    expect(view.items.map((i) => [i.name, i.trade, i.stage, i.reward]).sort()).toEqual(
      [
        ["Suresh N.", "Pipe fitter", "placed", "due"],
        ["Mohan R.", "Pipe fitter", "in_progress", "in_progress"],
        ["Kiran", "Pipe fitter", "closed", "not_eligible"],
      ].sort(),
    );
    const json = JSON.stringify(view);
    for (const secret of [placed.phone, placed.code, placed.id, "Naidu", "Babu", row.phone, row.id]) expect(json).not.toContain(secret);

    // Paid shows as paid.
    await svc.markReferralPaid(await makeStaff(["candidates.manage"]), markReferralPaidSchema.parse({ cvSubmissionId: placed.id, amount: "1500", currency: "INR" }));
    const after = await svc.lookupMyReferrals(check, { ipHash: ip() });
    expect(after.counts).toEqual({ total: 3, placed: 1, due: 0, paid: 1 });
    expect(after.items.find((i) => i.name === "Suresh N.")?.reward).toBe("paid");
  });

  it("gives one generic error for a wrong number or an unknown code, and rate-limits per code", async () => {
    const { input, link } = await newReferrer("Gopi Krishna");
    await expect(svc.lookupMyReferrals({ phone: phone(), code: link.code }, { ipHash: ip() })).rejects.toMatchObject({ message: svc.REFERRAL_LOOKUP_ERROR, code: "not_found" });
    await expect(svc.lookupMyReferrals({ phone: input.phone, code: "QQQQQQ" }, { ipHash: ip() })).rejects.toMatchObject({ message: svc.REFERRAL_LOOKUP_ERROR, code: "not_found" });
    for (let i = 0; i < 9; i++) await expect(svc.lookupMyReferrals({ phone: phone(), code: link.code }, { ipHash: ip() })).rejects.toMatchObject({ code: "not_found" });
    // Ten tries per code per hour: even the right number is refused now.
    await expect(svc.lookupMyReferrals({ phone: input.phone, code: link.code }, { ipHash: ip() })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("records one payout per departed CV, in the currency staff chose, and can undo it", async () => {
    const staff = await makeStaff(["candidates.manage"]);
    const { link, row } = await newReferrer("Payout Person");
    const cv = await referredCv(link.code, { status: "visa" });
    const pay = (amount: string, currency: string, id = cv.id) => svc.markReferralPaid(staff, markReferralPaidSchema.parse({ cvSubmissionId: id, amount, currency, note: "Paid by UPI" }));

    await expect(pay("1000", "INR")).rejects.toThrow(/after the person has departed/);
    await db.update(s.cvSubmissions).set({ status: "departed" }).where(eq(s.cvSubmissions.id, cv.id));
    // A currency that is not active must be refused. Another suite may have added SAR to the shared test database,
    // so switch it off for this check and put it back afterwards.
    const [sar] = await db.select({ isActive: s.currencies.isActive }).from(s.currencies).where(eq(s.currencies.code, "SAR"));
    if (sar?.isActive) await db.update(s.currencies).set({ isActive: false }).where(eq(s.currencies.code, "SAR"));
    try {
      await expect(pay("10", "SAR")).rejects.toMatchObject({ fieldErrors: { currency: [expect.any(String)] } });
    } finally {
      if (sar?.isActive) await db.update(s.currencies).set({ isActive: true }).where(eq(s.currencies.code, "SAR"));
    }
    await expect(svc.markReferralPaid(await makeStaff(["candidates.view"]), markReferralPaidSchema.parse({ cvSubmissionId: cv.id, amount: "1", currency: "INR" }))).rejects.toMatchObject({ code: "forbidden" });

    await pay("12.345", "KWD");
    const [payout] = await db.select().from(s.referralPayouts).where(eq(s.referralPayouts.cvSubmissionId, cv.id));
    expect(payout).toMatchObject({ referrerId: row.id, amountMinor: 12345, currency: "KWD", note: "Paid by UPI", paidByUserId: staff.user.id });
    await expect(pay("5", "AED")).rejects.toMatchObject({ code: "already_paid" });
    await expect(db.insert(s.referralPayouts).values({ cvSubmissionId: cv.id, referrerId: row.id, amountMinor: 1, currency: "INR" })).rejects.toThrow();
    await expect(db.insert(s.referralPayouts).values({ cvSubmissionId: (await referredCv(link.code)).id, referrerId: row.id, amountMinor: 0, currency: "INR" })).rejects.toThrow();

    await svc.undoReferralPayout(staff, { cvSubmissionId: cv.id });
    expect(await db.select().from(s.referralPayouts).where(eq(s.referralPayouts.cvSubmissionId, cv.id))).toHaveLength(0);
    await expect(svc.undoReferralPayout(staff, { cvSubmissionId: cv.id })).rejects.toThrow(/no payment recorded/);

    // A blocked referrer cannot be paid until unblocked.
    await svc.setReferrerStatus(staff, { id: row.id, status: "blocked" });
    await expect(pay("1000", "INR")).rejects.toThrow(/blocked/);
    await svc.setReferrerStatus(staff, { id: row.id, status: "active" });
    await pay("1000", "INR");

    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, cv.id), inArray(s.auditLogs.action, ["referral.payout_recorded", "referral.payout_removed"])));
    expect(audits.map((a) => a.action).sort()).toEqual(["referral.payout_recorded", "referral.payout_recorded", "referral.payout_removed"]);
    expect(JSON.stringify(audits.map((a) => a.metadata))).not.toContain("Paid by UPI");
  });

  it("lists referred CVs with the derived reward (due first) and referrers with paid totals per currency", async () => {
    const staff = await makeStaff(["candidates.manage", "candidates.view_contact"]);
    const { link, row } = await newReferrer("Listing Referrer");
    const due = await referredCv(link.code, { status: "departed", name: "Due Person" });
    const paidInr = await referredCv(link.code, { status: "departed", name: "Paid Inr" });
    const paidAed = await referredCv(link.code, { status: "departed", name: "Paid Aed" });
    const self = await referredCv(link.code, { status: "contacted", name: "Listing Referrer", phone: row.phone });
    await svc.markReferralPaid(staff, markReferralPaidSchema.parse({ cvSubmissionId: paidInr.id, amount: "2000", currency: "INR" }));
    await svc.markReferralPaid(staff, markReferralPaidSchema.parse({ cvSubmissionId: paidAed.id, amount: "150.50", currency: "AED" }));

    const all = await q.listReferredCvs(staff, referralFiltersSchema.parse({ referrer: row.id }), page);
    expect(all.total).toBe(4);
    expect(all.items[0]!.id).toBe(due.id);
    const byId = new Map(all.items.map((i) => [i.id, i]));
    expect(byId.get(due.id)).toMatchObject({ reward: "due", payout: null, referrer: { id: row.id, code: link.code, phone: row.phone } });
    expect(byId.get(paidAed.id)).toMatchObject({ reward: "paid", payout: { amountMinor: 15050, currency: "AED", paidByName: "Referral staff" } });
    expect(byId.get(self.id)).toMatchObject({ reward: "in_progress", selfReferral: true });

    const dueOnly = await q.listReferredCvs(staff, referralFiltersSchema.parse({ referrer: row.id, reward: "due" }), page);
    expect(dueOnly.items.map((i) => i.id)).toEqual([due.id]);
    const paidOnly = await q.listReferredCvs(staff, referralFiltersSchema.parse({ referrer: row.id, reward: "paid" }), page);
    expect(paidOnly.items.map((i) => i.id).sort()).toEqual([paidInr.id, paidAed.id].sort());
    const searched = await q.listReferredCvs(staff, referralFiltersSchema.parse({ q: due.code }), page);
    expect(searched.items.map((i) => i.id)).toEqual([due.id]);

    const people = await q.listReferrers(staff, referralFiltersSchema.parse({ view: "referrers", q: link.code }), page);
    expect(people.items).toHaveLength(1);
    expect(people.items[0]).toMatchObject({ id: row.id, phone: row.phone, referredCount: 4, placedCount: 3, dueCount: 1, paidCount: 2 });
    expect(people.items[0]!.paidTotals).toEqual([
      { currency: "AED", amountMinor: 15050 },
      { currency: "INR", amountMinor: 200000 },
    ]);

    // Staff find a referrer by the number as WhatsApp shows it ("+91 98765 43210"), with spaces or a leading 0.
    const national = row.phone.slice(3);
    for (const typed of [`+91 ${national.slice(0, 5)} ${national.slice(5)}`, `${national.slice(0, 5)} ${national.slice(5)}`, `0${national}`]) {
      const found = await q.listReferrers(staff, referralFiltersSchema.parse({ view: "referrers", q: typed }), page);
      expect(found.items.map((i) => i.id)).toEqual([row.id]);
    }

    // Without the contact permission the numbers are masked; a list with numbers is logged.
    const viewer = await makeStaff(["candidates.manage"]);
    const masked = await q.listReferrers(viewer, referralFiltersSchema.parse({ view: "referrers", q: link.code }), page);
    expect(masked.items[0]).toMatchObject({ phone: null, phoneMasked: expect.stringContaining(row.phone.slice(-4)) });
    const logs = await db.select().from(s.dataAccessLogs).where(and(eq(s.dataAccessLogs.actorUserId, staff.user.id), eq(s.dataAccessLogs.subjectType, "referrer")));
    expect(logs.length).toBeGreaterThan(0);

    const summary = await q.referralSummary(staff);
    expect(summary.due).toBeGreaterThanOrEqual(1);
    expect(summary.paidTotals.map((t) => t.currency)).toEqual(expect.arrayContaining(["AED", "INR"]));
    expect(await q.countDueReferralRewards()).toBe(summary.due);

    const exported = await q.listReferredCvsForExport(staff, referralFiltersSchema.parse({ referrer: row.id }), 10);
    expect(exported.total).toBe(4);
    expect(exported.rows.every((r) => r.referrerPhoneRaw === row.phone)).toBe(true);
    await expect(q.listReferrers(await makeStaff(["candidates.view"]), referralFiltersSchema.parse({}), page)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets staff attach a CV to a referrer by reference, and take it off again until a payment is recorded", async () => {
    const staff = await makeStaff(["candidates.manage"]);
    const first = await newReferrer("First Referrer");
    const second = await newReferrer("Second Referrer");
    const cv = await referredCv(null, { status: "departed" });
    const before = cv.updatedAt;

    const linked = await svc.linkCvToReferrer(staff, { cvReference: cv.code, referralCode: first.link.code });
    expect(linked).toEqual({ cvSubmissionId: cv.id, referrerName: "First Referrer", changed: true, previousReferrerName: null });
    const [afterLink] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.id, cv.id));
    expect(afterLink).toMatchObject({ referralCode: first.link.code });
    expect(afterLink!.updatedAt.getTime()).toBe(before.getTime());
    expect((await svc.linkCvToReferrer(staff, { cvReference: cv.code, referralCode: first.link.code })).changed).toBe(false);

    await expect(svc.linkCvToReferrer(staff, { cvReference: "VSG-CV-0000001", referralCode: first.link.code })).rejects.toMatchObject({ fieldErrors: { cvReference: [expect.any(String)] } });
    await expect(svc.linkCvToReferrer(staff, { cvReference: cv.code, referralCode: "QQQQQQ" })).rejects.toMatchObject({ fieldErrors: { referralCode: [expect.any(String)] } });

    // Re-linking moves it and names the referrer it was taken from; once paid it is locked.
    expect(await svc.linkCvToReferrer(staff, { cvReference: cv.code, referralCode: second.link.code })).toMatchObject({ changed: true, referrerName: "Second Referrer", previousReferrerName: "First Referrer" });
    const linkAudits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, cv.id), eq(s.auditLogs.action, "cv_submission.referral_linked")));
    expect(linkAudits.map((a) => a.metadata)).toContainEqual(expect.objectContaining({ code: second.link.code, previousCode: first.link.code, previousReferrerId: first.row.id }));
    await svc.markReferralPaid(staff, markReferralPaidSchema.parse({ cvSubmissionId: cv.id, amount: "500", currency: "INR" }));
    const [payout] = await db.select().from(s.referralPayouts).where(eq(s.referralPayouts.cvSubmissionId, cv.id));
    expect(payout!.referrerId).toBe(second.row.id);
    await expect(svc.linkCvToReferrer(staff, { cvReference: cv.code, referralCode: first.link.code })).rejects.toThrow(/already recorded as paid/);
    await expect(svc.unlinkCvReferral(staff, { cvSubmissionId: cv.id })).rejects.toThrow(/already recorded as paid/);

    await svc.undoReferralPayout(staff, { cvSubmissionId: cv.id });
    await svc.unlinkCvReferral(staff, { cvSubmissionId: cv.id });
    const [afterUnlink] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.id, cv.id));
    expect(afterUnlink!.referralCode).toBeNull();
    const actions = (await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, cv.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["cv_submission.referral_linked", "cv_submission.referral_unlinked"]));
  });
});
