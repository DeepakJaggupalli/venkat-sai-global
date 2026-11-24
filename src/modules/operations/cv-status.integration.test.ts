/**
 * Public CV status check (/status) and the documents.expiry_alerts task, against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_status
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_status npx vitest run src/modules/operations/cv-status
 *   node scripts/test-db.mjs vsg_test_status --drop
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "status", "storage-test"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("CV status check and document expiry alerts (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });

  const fs = await import("node:fs/promises");
  const { and, eq, like } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const cv = await import("./cv-submissions");
  const { cvSubmissionSchema, cvStatusLookupSchema } = await import("./cv-submission-schemas");
  const expiry = await import("./document-expiry");
  const { staffContext, createTestUser } = await import("@/modules/candidates/test-fixtures");

  const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  let categoryId = "";

  beforeAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    const [cat] = await db.insert(s.jobCategories).values({ slug: `welder-${randomUUID().slice(0, 6)}`, name: "TIG welder" }).returning({ id: s.jobCategories.id });
    categoryId = cat!.id;
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  const phone = () => `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const ip = () => `ip-${randomUUID()}`;

  async function submit(overrides: Record<string, unknown> = {}) {
    const input = cvSubmissionSchema.parse({ name: "Ravi Kumar Reddy", phone: phone(), trade: categoryId, consentToContact: "true", passportNumber: "Z1234567", ...overrides });
    const result = await cv.submitCvSubmission(input, { data: PDF, name: "cv.pdf", type: "application/pdf" }, { ipHash: ip() });
    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.code, result.code!));
    return row!;
  }

  it("shows only safe fields for the right mobile number and reference, with the stage dates and the candidate note", async () => {
    const row = await submit();
    const staff = await staffContext("candidates.view", "candidates.manage");
    await cv.setCvSubmissionStatus(staff, { id: row.id, status: "trade_test", candidateNote: "Trade test on 5 December at our office." });
    await cv.setCvSubmissionRemarks(staff, { id: row.id, remarks: "Staff only: strong welder" });

    // The visitor types a local number and a lower-case reference.
    const input = cvStatusLookupSchema.parse({ phone: row.phone.replace("+91", ""), reference: row.code.toLowerCase() });
    const view = await cv.lookupCvStatus(input, { ipHash: ip() });
    expect(Object.keys(view).sort()).toEqual(["hasCv", "initials", "journeyStage", "note", "reference", "stageDates", "status", "trade", "updatedAt"]);
    expect(view).toMatchObject({ initials: "R. K. R.", trade: "TIG welder", status: "trade_test", journeyStage: "trade_test", note: "Trade test on 5 December at our office.", hasCv: true, reference: row.code });
    expect(Object.keys(view.stageDates).sort()).toEqual(["received", "trade_test"]);
    const json = JSON.stringify(view);
    for (const secret of [row.phone, "Z1234567", "4567", "Staff only", "Ravi", row.id]) expect(json).not.toContain(secret);

    // On hold: the tracker stays at the last journey stage; the history records every change.
    await cv.setCvSubmissionStatus(staff, { id: row.id, status: "on_hold" });
    const held = await cv.lookupCvStatus(input, { ipHash: ip() });
    expect(held).toMatchObject({ status: "on_hold", journeyStage: "trade_test", note: "Trade test on 5 December at our office." });
    const detail = await cv.getCvSubmission(staff, row.id);
    expect(detail!.stageHistory.map((e) => e.status)).toEqual(["received", "trade_test", "on_hold"]);
    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, row.id), like(s.auditLogs.action, "cv_submission.%")));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["cv_submission.status_changed", "cv_submission.candidate_note_updated"]));
  });

  it("gives the same generic error for a wrong mobile number and an unknown reference", async () => {
    const row = await submit();
    const wrongPhone = cv.lookupCvStatus({ phone: phone(), reference: row.code }, { ipHash: ip() });
    await expect(wrongPhone).rejects.toMatchObject({ message: cv.CV_STATUS_LOOKUP_ERROR, code: "not_found" });
    const unknown = cv.lookupCvStatus({ phone: row.phone, reference: "VSG-CV-999999" }, { ipHash: ip() });
    await expect(unknown).rejects.toMatchObject({ message: cv.CV_STATUS_LOOKUP_ERROR, code: "not_found" });
    expect(cvStatusLookupSchema.safeParse({ phone: row.phone, reference: "VSG-JOB-000001" }).success).toBe(false);
  });

  it("rate-limits per reference and per network", async () => {
    const row = await submit();
    for (let i = 0; i < 5; i++) await expect(cv.lookupCvStatus({ phone: phone(), reference: row.code }, { ipHash: ip() })).rejects.toMatchObject({ code: "not_found" });
    // Even the right number is refused once the reference is locked.
    await expect(cv.lookupCvStatus({ phone: row.phone, reference: row.code }, { ipHash: ip() })).rejects.toMatchObject({ code: "rate_limited" });

    const network = ip();
    for (let i = 0; i < 10; i++) await expect(cv.lookupCvStatus({ phone: phone(), reference: `VSG-CV-8${String(i).padStart(5, "0")}` }, { ipHash: network })).rejects.toMatchObject({ code: "not_found" });
    await expect(cv.lookupCvStatus({ phone: phone(), reference: "VSG-CV-899999" }, { ipHash: network })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("alerts passports (6/3/1 months) and documents (30 days) once per threshold, in one staff digest", async () => {
    const now = new Date();
    const inMonths = (m: number, days = 0) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, now.getUTCDate() + days));
      return d.toISOString().slice(0, 10);
    };
    // CV passport in ~2 months (3-month threshold); one far away and one not suitable are ignored.
    const soon = await submit({ passportExpiry: inMonths(2) });
    const far = await submit({ passportExpiry: inMonths(9) });
    const rejected = await submit({ passportExpiry: inMonths(2) });
    await cv.setCvSubmissionStatus(await staffContext("candidates.manage"), { id: rejected.id, status: "not_suitable" });
    // The CV candidate also has an account with the same (verified) phone number.
    const cvUser = await createTestUser({ name: "Ravi account" });
    await db.update(s.users).set({ phone: soon.phone, phoneVerifiedAt: new Date() }).where(eq(s.users.id, cvUser.id));
    // A profile passport in ~5 months (6-month threshold) and a licence in 10 days.
    const user = await createTestUser({ name: "Profile candidate" });
    const [profile] = await db.insert(s.candidateProfiles).values({ userId: user.id, passportExpiry: inMonths(5) }).returning();
    const [licence] = await db.insert(s.candidateCredentials).values({ candidateId: profile!.id, credentialType: "licence", name: "Crane operator licence", expiresAt: inMonths(0, 10) }).returning();
    const [lapsed] = await db.insert(s.candidateCredentials).values({ candidateId: profile!.id, credentialType: "licence", name: "Old licence", expiresAt: inMonths(0, 45) }).returning();

    const listed = await expiry.findExpiringItems(now);
    const ids = listed.map((i) => i.itemId);
    expect(ids).toEqual(expect.arrayContaining([soon.id, profile!.id, licence!.id]));
    expect(ids).not.toContain(far.id);
    expect(ids).not.toContain(rejected.id);
    expect(ids).not.toContain(lapsed!.id);
    expect(listed.find((i) => i.itemId === soon.id)?.userId).toBe(cvUser.id);

    // /admin/candidates "Expiring soon" filter and badge (staff only).
    const { searchCandidates } = await import("@/modules/candidates/search");
    const { candidateSearchFiltersSchema } = await import("@/modules/candidates/schemas");
    const viewer = { kind: "staff" as const, ctx: await staffContext("candidates.view", "candidates.manage") };
    const found = await searchCandidates(candidateSearchFiltersSchema.parse({ expiringSoon: "true", includeHidden: "true", pageSize: 50 }), viewer);
    expect(found.items.find((c) => c.candidateId === profile!.id)?.expiringSoon).toBe(true);
    expect(found.items.every((c) => c.expiringSoon)).toBe(true);

    // Other suites sharing the database may hold expiring items (and older jobs) too: count only what this run adds,
    // and check this suite's own items exactly below.
    const jobIdsBefore = new Set((await db.select({ id: s.backgroundJobs.id }).from(s.backgroundJobs).where(like(s.backgroundJobs.type, "notifications.dispatch%"))).map((j) => j.id));
    const first = await expiry.runDocumentExpiryAlerts(now);
    expect(first).toMatchObject({ staffDigest: true });
    expect(first.newAlerts).toBeGreaterThanOrEqual(3);
    expect(first.candidateAlerts).toBeGreaterThanOrEqual(3);
    const mine = new Set([soon.id, far.id, rejected.id, profile!.id, licence!.id, lapsed!.id]);
    const sent = (await db.select().from(s.documentExpiryAlerts)).filter((a) => mine.has(a.itemId));
    expect(sent.map((a) => [a.itemId, a.thresholdMonths]).sort()).toEqual(
      [
        [soon.id, 3],
        [profile!.id, 6],
        [licence!.id, 1],
      ].sort(),
    );
    const jobs = (await db.select().from(s.backgroundJobs).where(like(s.backgroundJobs.type, "notifications.dispatch%"))).filter((j) => !jobIdsBefore.has(j.id));
    const digests = jobs.filter((j) => (j.payload as { event?: string }).event === "documents.expiry_digest");
    expect(digests.filter((j) => j.type === "notifications.dispatch_staff")).toHaveLength(1);
    const items = String((digests.find((j) => j.type === "notifications.dispatch_staff")!.payload as { data: { items: string } }).data.items);
    expect(items).toContain(soon.code);
    expect(items).not.toContain("Z1234567");
    const candidateJobs = jobs.filter((j) => (j.payload as { event?: string }).event === "documents.expiring");
    expect(candidateJobs.length).toBeGreaterThanOrEqual(3);

    // Same day again: nothing new, no second digest.
    expect(await expiry.runDocumentExpiryAlerts(now)).toMatchObject({ newAlerts: 0, staffDigest: false, candidateAlerts: 0 });

    // Six weeks later the CV passport crosses the 1-month threshold and alerts once more.
    const later = new Date(now.getTime() + 42 * 86_400_000);
    const next = await expiry.runDocumentExpiryAlerts(later);
    expect(next.newAlerts).toBeGreaterThanOrEqual(1);
    const soonAlerts = await db.select().from(s.documentExpiryAlerts).where(eq(s.documentExpiryAlerts.itemId, soon.id));
    expect(soonAlerts.map((a) => a.thresholdMonths).sort()).toEqual([1, 3]);
  });

  it("filters expiring passports in the staff list", async () => {
    const staff = await staffContext("candidates.view");
    const list = await cv.listCvSubmissions(staff, { expiring: true }, { page: 1, pageSize: 100, offset: 0 });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((i) => i.passportExpiringSoon)).toBe(true);
  });
});
