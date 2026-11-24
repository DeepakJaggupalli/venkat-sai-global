/**
 * Worker reviews (links, one review per CV, moderation, public listing) against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_t_reviews
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_reviews npx vitest run src/modules/worker-reviews --no-file-parallelism
 *   node scripts/test-db.mjs vsg_t_reviews --drop
 * (Throwaway databases named vsg_t_*, vsg_test_* or vsg_r_* — never the main one.)
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /\/vsg_(?:t|test|r)_[a-z0-9_]+(\?|$)/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("worker reviews (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_t_* or vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq, inArray } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { env } = await import("@/lib/env");
  const { signTokenWith } = await import("@/lib/signed-token");
  const service = await import("./service");
  const queries = await import("./queries");
  const { workerReviewSubmitSchema } = await import("./schemas");
  const { issueWorkerReviewToken, WORKER_REVIEW_TOKEN_PURPOSE } = await import("./tokens");
  const { staffContext } = await import("@/modules/candidates/test-fixtures");

  const RUN = randomUUID().slice(0, 6).toUpperCase();
  let seq = 0;

  beforeAll(async () => {
    await db
      .insert(s.countries)
      .values([
        { code: "QA", name: "Qatar", isDestination: true },
        { code: "AE", name: "United Arab Emirates", isDestination: true },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await pool.end();
  });

  const phone = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const ip = () => `ip-${randomUUID()}`;

  async function cv(overrides: Partial<typeof s.cvSubmissions.$inferInsert> = {}) {
    seq += 1;
    const [row] = await db
      .insert(s.cvSubmissions)
      .values({
        code: `VSG-CV-R${RUN}${String(seq).padStart(3, "0")}`,
        name: "Ravi Kumar Reddy",
        phone: phone(),
        tradeLabel: "TIG welder",
        preferredCountryCode: "QA",
        consentToContact: true,
        status: "departed",
        statusChangedAt: new Date(),
        ...overrides,
      })
      .returning();
    return row!;
  }

  function form(token: string, overrides: Record<string, unknown> = {}) {
    return workerReviewSubmitSchema.parse({ token, rating: "5", body: "They helped me with the visa and the ticket. Good team.", displayName: "Ravi R.", trade: "TIG welder", countryCode: "QA", ...overrides });
  }

  async function review(submission: { id: string }, overrides: Record<string, unknown> = {}) {
    await service.submitWorkerReview(form(issueWorkerReviewToken(submission.id).token, overrides), { ipHash: ip() });
    const [row] = await db.select().from(s.workerReviews).where(eq(s.workerReviews.cvSubmissionId, submission.id));
    return row!;
  }

  it("opens a prefilled form, takes exactly one review, then reports the link as used", async () => {
    const submission = await cv({ name: "K. Ravi Kumar" });
    const { token } = issueWorkerReviewToken(submission.id);

    const link = await service.resolveWorkerReviewLink(token);
    expect(link).toMatchObject({ state: "open", firstName: "Ravi", displayName: "Ravi K.", trade: "TIG welder", countryCode: "QA" });
    expect(JSON.stringify(link)).not.toContain(submission.phone);

    const network = ip();
    const result = await service.submitWorkerReview(form(token, { consentToPublish: "true", rating: "4", countryCode: "ae" }), { ipHash: network });
    expect(result).toEqual({ firstName: "Ravi", consentToPublish: true });

    const rows = await db.select().from(s.workerReviews).where(eq(s.workerReviews.cvSubmissionId, submission.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", rating: 4, countryCode: "AE", consentToPublish: true, displayName: "Ravi R.", ipHash: network, publishedAt: null });

    expect(await service.resolveWorkerReviewLink(token)).toEqual({ state: "used", firstName: "Ravi" });
    await expect(service.submitWorkerReview(form(token), { ipHash: ip() })).rejects.toMatchObject({ code: "already_reviewed" });
    // A fresh link for the same CV cannot add a second review either.
    await expect(service.submitWorkerReview(form(issueWorkerReviewToken(submission.id).token), { ipHash: ip() })).rejects.toMatchObject({ code: "already_reviewed" });

    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, rows[0]!.id), eq(s.auditLogs.action, "worker_review.received")));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorType).toBe("anonymous");
    expect(JSON.stringify(audits[0]!.metadata)).not.toContain("visa");
  });

  it("keeps one review per CV when two are sent at the same moment", async () => {
    const submission = await cv();
    const { token } = issueWorkerReviewToken(submission.id);
    const results = await Promise.allSettled([service.submitWorkerReview(form(token), { ipHash: ip() }), service.submitWorkerReview(form(token, { rating: "3" }), { ipHash: ip() })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "already_reviewed" });
    expect(await db.select().from(s.workerReviews).where(eq(s.workerReviews.cvSubmissionId, submission.id))).toHaveLength(1);
  });

  it("refuses expired, forged, other-purpose and unknown links", async () => {
    const submission = await cv();
    const secret = env().SESSION_SECRET;
    const expired = signTokenWith(secret, WORKER_REVIEW_TOKEN_PURPOSE, submission.id, new Date(Date.now() - 1000));
    const forged = signTokenWith(`${secret}-not-ours`, WORKER_REVIEW_TOKEN_PURPOSE, submission.id, new Date(Date.now() + 3600_000));
    const uploadLink = signTokenWith(secret, "cv_submission_documents", submission.id, new Date(Date.now() + 3600_000));
    const unknownCv = issueWorkerReviewToken(randomUUID()).token;
    for (const token of [expired, forged, uploadLink, unknownCv, "not-a-token-at-all-xxxxxxxx"]) {
      expect(await service.resolveWorkerReviewLink(token)).toEqual({ state: "expired" });
      await expect(service.submitWorkerReview(form(token), { ipHash: ip() })).rejects.toMatchObject({ code: "link_expired" });
    }
    expect(await db.select().from(s.workerReviews).where(eq(s.workerReviews.cvSubmissionId, submission.id))).toHaveLength(0);
  });

  it("drops honeypot hits silently and rate-limits each link", async () => {
    const trap = await cv();
    const dropped = await service.submitWorkerReview(form(issueWorkerReviewToken(trap.id).token, { website: "https://spam.example" }), { ipHash: ip() });
    expect(dropped).toEqual({ firstName: "", consentToPublish: false });
    expect(await db.select().from(s.workerReviews).where(eq(s.workerReviews.cvSubmissionId, trap.id))).toHaveLength(0);

    const submission = await cv();
    const { token } = issueWorkerReviewToken(submission.id);
    // An unknown country is a field error; five tries per hour per link, then the link is paused.
    for (let i = 0; i < 5; i++) {
      await expect(service.submitWorkerReview(form(token, { countryCode: "ZZ" }), { ipHash: ip() })).rejects.toMatchObject({ fieldErrors: { countryCode: ["Choose a country from the list"] } });
    }
    await expect(service.submitWorkerReview(form(token), { ipHash: ip() })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("shows only approved reviews with consent on the website; hide and show again work", async () => {
    const staff = await staffContext("candidates.manage", "candidates.view");
    const consented = await review(await cv({ name: "Suresh Babu" }), { consentToPublish: "true", displayName: "Suresh B.", body: "Honest people. Call me on 98765 43210" });
    const privateOne = await review(await cv(), { body: "Private feedback for the office only." });
    const waiting = await review(await cv(), { consentToPublish: "true", body: "Still waiting for approval." });
    const publicIds = async () => (await queries.listPublicWorkerReviews(48)).map((r) => r.id);

    expect(await publicIds()).not.toEqual(expect.arrayContaining([consented.id]));
    const before = await queries.countPublicWorkerReviews();

    await service.moderateWorkerReview(staff, { id: consented.id, decision: "approve" });
    const published = (await queries.listPublicWorkerReviews(48)).find((r) => r.id === consented.id);
    expect(published).toBeDefined();
    // Only what the worker chose to show: no CV link, phone, IP or status fields.
    expect(Object.keys(published!).sort()).toEqual(["body", "countryCode", "countryName", "displayName", "id", "rating", "trade", "writtenAt"]);
    expect(published).toMatchObject({ displayName: "Suresh B.", countryName: "Qatar", rating: 5 });
    expect(await queries.countPublicWorkerReviews()).toBe(before + 1);

    // No consent: cannot be published, only kept private.
    await expect(service.moderateWorkerReview(staff, { id: privateOne.id, decision: "approve" })).rejects.toMatchObject({ code: "no_consent" });
    await service.moderateWorkerReview(staff, { id: privateOne.id, decision: "reject" });
    await expect(service.moderateWorkerReview(staff, { id: privateOne.id, decision: "approve" })).rejects.toMatchObject({ code: "no_consent" });
    // The database refuses it too.
    await expect(db.update(s.workerReviews).set({ status: "approved" }).where(eq(s.workerReviews.id, privateOne.id))).rejects.toThrow();

    const ids = await publicIds();
    expect(ids).toContain(consented.id);
    expect(ids).not.toContain(privateOne.id);
    expect(ids).not.toContain(waiting.id);

    // A second click on Approve is told the review was already updated.
    await expect(service.moderateWorkerReview(staff, { id: consented.id, decision: "approve" })).rejects.toMatchObject({ code: "stale" });
    const [{ publishedAt } = { publishedAt: null }] = await db.select({ publishedAt: s.workerReviews.publishedAt }).from(s.workerReviews).where(eq(s.workerReviews.id, consented.id));
    expect(publishedAt).toBeInstanceOf(Date);

    await service.moderateWorkerReview(staff, { id: consented.id, decision: "hide" });
    expect(await publicIds()).not.toContain(consented.id);
    await service.moderateWorkerReview(staff, { id: consented.id, decision: "unhide" });
    expect(await publicIds()).toContain(consented.id);
    const [after] = await db.select().from(s.workerReviews).where(eq(s.workerReviews.id, consented.id));
    expect(after!.publishedAt?.getTime()).toBe(publishedAt!.getTime());
    expect(after!.reviewedByUserId).toBe(staff.user.id);

    // Staff lists: the contact-details hint, the CV reference, the tabs.
    const pending = await service.listWorkerReviewsForStaff(staff, "pending", { page: 1, pageSize: 100, offset: 0 });
    expect(pending.items.map((r) => r.id)).toContain(waiting.id);
    const shown = await service.listWorkerReviewsForStaff(staff, "published", { page: 1, pageSize: 100, offset: 0 });
    const card = shown.items.find((r) => r.id === consented.id);
    expect(card).toMatchObject({ mentionsContactDetails: true, cv: { name: "Suresh Babu" } });
    const notShown = await service.listWorkerReviewsForStaff(staff, "rejected", { page: 1, pageSize: 100, offset: 0 });
    expect(notShown.items.map((r) => r.id)).toContain(privateOne.id);
    // Without candidates.view the CV name and reference are left out.
    const noCvView = await staffContext("candidates.manage");
    const masked = await service.listWorkerReviewsForStaff(noCvView, "published", { page: 1, pageSize: 100, offset: 0 });
    expect(masked.items.find((r) => r.id === consented.id)?.cv).toBeNull();

    const audits = await db.select({ action: s.auditLogs.action }).from(s.auditLogs).where(eq(s.auditLogs.entityId, consented.id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["worker_review.received", "worker_review.approved", "worker_review.hidden", "worker_review.unhidden"]));
  });

  it("lists departed workers without a review to ask, newest first, with working WhatsApp links", async () => {
    const staff = await staffContext("candidates.manage", "candidates.view", "candidates.view_contact");
    const countsBefore = await service.workerReviewCounts(staff);
    const older = await cv({ name: "Older Departure", statusChangedAt: new Date(Date.now() - 3 * 24 * 3600_000) });
    const newer = await cv({ name: "Newer Departure", statusChangedAt: new Date(Date.now() - 3600_000) });
    const notYet = await cv({ name: "Visa Stage", status: "visa" });
    const reviewed = await cv({ name: "Already Reviewed" });
    await review(reviewed);

    const page = await service.listReviewAskQueue(staff, { page: 1, pageSize: 100, offset: 0 });
    const ids = page.items.map((i) => i.submissionId);
    expect(ids).toEqual(expect.arrayContaining([older.id, newer.id]));
    expect(ids).not.toContain(notYet.id);
    expect(ids).not.toContain(reviewed.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));

    const item = page.items.find((i) => i.submissionId === newer.id)!;
    expect(item).toMatchObject({ firstName: "Newer", phone: newer.phone, askCount: 0, lastAskedAt: null });
    expect(item.whatsappUrl).toMatch(new RegExp(`^https://wa\\.me/${newer.phone.replace("+", "")}\\?text=`));
    expect(decodeURIComponent(item.whatsappUrl!.split("?text=")[1]!)).toContain(item.reviewUrl);
    const token = new URL(item.reviewUrl).pathname.split("/").pop()!;
    expect(await service.resolveWorkerReviewLink(decodeURIComponent(token))).toMatchObject({ state: "open", firstName: "Newer" });
    const logs = await db.select().from(s.dataAccessLogs).where(and(eq(s.dataAccessLogs.actorUserId, staff.user.id), eq(s.dataAccessLogs.dataCategory, "contact")));
    expect(logs.length).toBeGreaterThan(0);

    // Without the contact permission: no phone, no WhatsApp link, nothing logged; the link can still be copied.
    const noContact = await staffContext("candidates.manage");
    const masked = (await service.listReviewAskQueue(noContact, { page: 1, pageSize: 100, offset: 0 })).items.find((i) => i.submissionId === newer.id)!;
    expect(masked).toMatchObject({ phone: null, whatsappUrl: null });
    expect(masked.reviewUrl).toContain("/review/");
    expect(await db.select().from(s.dataAccessLogs).where(eq(s.dataAccessLogs.actorUserId, noContact.user.id))).toHaveLength(0);

    // Asking is recorded (who, when, how) and audited; only for departed workers without a review.
    await service.recordReviewRequest(staff, { submissionId: newer.id, channel: "whatsapp" });
    await service.recordReviewRequest(staff, { submissionId: newer.id, channel: "link" });
    const asked = (await service.listReviewAskQueue(staff, { page: 1, pageSize: 100, offset: 0 })).items.find((i) => i.submissionId === newer.id)!;
    expect(asked).toMatchObject({ askCount: 2, lastAskedChannel: "link", lastAskedByName: "Staff Member" });
    expect(asked.lastAskedAt).toBeInstanceOf(Date);
    await expect(service.recordReviewRequest(staff, { submissionId: notYet.id, channel: "whatsapp" })).rejects.toMatchObject({ code: "not_departed" });
    await expect(service.recordReviewRequest(staff, { submissionId: reviewed.id, channel: "whatsapp" })).rejects.toMatchObject({ code: "already_reviewed" });
    const requestAudits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, newer.id), eq(s.auditLogs.action, "worker_review.requested")));
    expect(requestAudits).toHaveLength(2);

    // ?ask=<id> from the CV page.
    expect(await service.getReviewAskItem(staff, older.id)).toMatchObject({ state: "eligible", item: { submissionId: older.id } });
    expect(await service.getReviewAskItem(staff, notYet.id)).toMatchObject({ state: "not_departed", status: "visa" });
    expect(await service.getReviewAskItem(staff, reviewed.id)).toMatchObject({ state: "reviewed", reviewStatus: "pending" });
    expect(await service.getReviewAskItem(staff, randomUUID())).toEqual({ state: "not_found" });
    expect(await service.getReviewAskItem(staff, "not-an-id")).toEqual({ state: "not_found" });
    const excluded = await service.listReviewAskQueue(staff, { page: 1, pageSize: 100, offset: 0 }, { excludeId: older.id });
    expect(excluded.items.map((i) => i.submissionId)).not.toContain(older.id);

    const countsAfter = await service.workerReviewCounts(staff);
    expect(countsAfter.ask - countsBefore.ask).toBe(2);
    expect(countsAfter.pending - countsBefore.pending).toBe(1);
  });

  it("needs candidates.manage for everything on the staff side", async () => {
    const viewer = await staffContext("candidates.view", "candidates.view_contact", "content.publish");
    const submission = await cv();
    const pendingReview = await review(submission, { consentToPublish: "true" });
    const page = { page: 1, pageSize: 10, offset: 0 };
    await expect(service.workerReviewCounts(viewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.listReviewAskQueue(viewer, page)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getReviewAskItem(viewer, submission.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.listWorkerReviewsForStaff(viewer, "pending", page)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.recordReviewRequest(viewer, { submissionId: submission.id, channel: "link" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.moderateWorkerReview(viewer, { id: pendingReview.id, decision: "approve" })).rejects.toMatchObject({ code: "forbidden" });
    const [row] = await db.select({ status: s.workerReviews.status }).from(s.workerReviews).where(inArray(s.workerReviews.id, [pendingReview.id]));
    expect(row!.status).toBe("pending");
  });
});
