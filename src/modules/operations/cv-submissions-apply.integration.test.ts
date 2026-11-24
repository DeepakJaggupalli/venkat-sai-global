/**
 * Quick apply (optional CV, email, experience abroad / in India, referral code), the per-poster applicants list
 * (filters, search, masking, counts, "copy all phone numbers"), attaching a CV later, the no-CV pack and status page,
 * against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_apply
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_apply npx vitest run src/modules/operations/cv-submissions-apply
 *   node scripts/test-db.mjs vsg_test_apply --drop
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "apply", "storage-test"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("Quick apply and requirement applicants (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });

  const fs = await import("node:fs/promises");
  const { and, eq, gte, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const cv = await import("./cv-submissions");
  const { cvSubmissionSchema } = await import("./cv-submission-schemas");
  const { buildCvSubmissionPack } = await import("./cv-pack");
  const { staffContext } = await import("@/modules/candidates/test-fixtures");

  const tag = randomUUID().slice(0, 8);
  const startedAt = new Date(Date.now() - 1000);
  const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  const phone = () => `+9196${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const ip = () => `ip-${randomUUID()}`;
  let categoryId = "";
  let posterA = { id: "", slug: "" };
  let posterB = { id: "", slug: "" };

  beforeAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    await db.insert(s.countries).values({ code: "AE", name: "United Arab Emirates" }).onConflictDoNothing();
    const [cat] = await db.insert(s.jobCategories).values({ slug: `rigger-${tag}`, name: "Rigger" }).returning({ id: s.jobCategories.id });
    categoryId = cat!.id;
    const poster = async (slug: string, title: string) => {
      const [row] = await db
        .insert(s.cmsEntries)
        .values({ collection: "requirement_posts", slug, title, status: "published", publishedAt: new Date(), publishedVersion: 1, data: { countryCode: "AE", trades: [{ trade: "Rigger" }, { trade: "Mechanical helper" }] } })
        .returning({ id: s.cmsEntries.id, slug: s.cmsEntries.slug });
      return { id: row!.id, slug: row!.slug };
    };
    posterA = await poster(`riggers-dubai-${tag}`, "Dubai - Riggers");
    posterB = await poster(`helpers-sharjah-${tag}`, "Sharjah - Helpers");
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  function parse(overrides: Record<string, unknown> = {}) {
    return cvSubmissionSchema.parse({ name: "Suresh Babu", phone: phone(), trade: categoryId, consentToContact: "true", ...overrides });
  }

  async function rowOf(code: string) {
    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.code, code));
    return row!;
  }

  let noCvCode = "";
  let noCvId = "";
  let withCvId = "";
  const applicantPhones: string[] = [];

  it("records an application without a CV, with email, experience abroad and in India, and a referral code", async () => {
    const input = parse({
      requirement: posterA.slug,
      email: "  Suresh.Babu@Example.COM ",
      experienceAbroadYears: "5",
      experienceIndiaYears: "3",
      referralCode: "ref12ab",
      passportNumber: "zx12-abcd",
    });
    applicantPhones.push(input.phone);
    const result = await cv.submitCvSubmission(input, null, { ipHash: ip(), sourcePage: "/send-cv" });
    expect(result).toMatchObject({ hasCv: false, requirementTitle: "Dubai - Riggers", trade: "Rigger" });
    expect(result.uploadToken).toBeTruthy();
    noCvCode = result.code!;
    const row = await rowOf(noCvCode);
    noCvId = row.id;
    expect(row).toMatchObject({
      cvFileId: null,
      email: "suresh.babu@example.com",
      experienceAbroadYears: 5,
      experienceIndiaYears: 3,
      experienceYears: 8,
      referralCode: "REF12AB",
      source: "website",
      requirementEntryId: posterA.id,
      passportNumberLast4: "ABCD",
      hasPassport: true,
    });

    const [received] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, row.id), eq(s.auditLogs.action, "cv_submission.received")));
    expect(received?.metadata).toMatchObject({ hasCv: false, fileId: null, referralCode: "REF12AB" });

    // Staff alert without contact details; the business inbox copy says the CV is missing and carries the email.
    const jobs = await db
      .select()
      .from(s.backgroundJobs)
      .where(and(gte(s.backgroundJobs.createdAt, startedAt), sql`${s.backgroundJobs.payload}->>'event' = 'cv.received'`));
    const payloads = jobs.map((j) => JSON.stringify(j.payload)).filter((p) => p.includes(noCvCode));
    expect(payloads.some((p) => p.includes("suresh.babu@example.com") && p.includes('"cvMissing":true'))).toBe(true);
    expect(payloads.some((p) => p.includes("candidates.manage") && !p.includes("suresh.babu@example.com") && !p.includes(row.phone))).toBe(true);
  });

  it("still stores a CV when one is sent, and caps the experience total at 60", async () => {
    const input = parse({ requirement: posterA.slug, name: "Anil Varma", experienceAbroadYears: "40", experienceIndiaYears: "30" });
    applicantPhones.push(input.phone);
    const result = await cv.submitCvSubmission(input, { data: PDF, name: "cv.pdf", type: "application/pdf" }, { ipHash: ip() });
    expect(result.hasCv).toBe(true);
    const row = await rowOf(result.code!);
    withCvId = row.id;
    expect(row.cvFileId).not.toBeNull();
    expect(row).toMatchObject({ experienceAbroadYears: 40, experienceIndiaYears: 30, experienceYears: 60, email: null, referralCode: null });

    // Another poster and a general application, to check the per-poster list.
    await cv.submitCvSubmission(parse({ requirement: posterB.slug, name: "Other Poster" }), null, { ipHash: ip() });
    await cv.submitCvSubmission(parse({ name: "General Applicant", trade: `other:Crane operator ${tag}` }), null, { ipHash: ip() });
  });

  it("lists one poster's applicants with counts, search, filters and the right masking", async () => {
    const viewer = await staffContext("candidates.view");
    const page = { page: 1, pageSize: 50, offset: 0 };
    const list = await cv.listCvSubmissions(viewer, { requirement: posterA.id }, page);
    expect(list.total).toBe(2);
    expect(list.items.map((i) => i.name)).toEqual(["Anil Varma", "Suresh Babu"]);
    const suresh = list.items.find((i) => i.id === noCvId)!;
    expect(suresh).toMatchObject({
      hasCv: false,
      cvUrl: null,
      passportDisplay: "XXXXABCD",
      passportFull: false,
      phone: null,
      email: null,
      emailMasked: "s***@example.com",
      experienceAbroadYears: 5,
      experienceIndiaYears: 3,
      referralCode: "REF12AB",
      source: "website",
      requirementTitle: "Dubai - Riggers",
    });

    const counts = await cv.countApplicantsByPoster(viewer, [posterA.id, posterB.id, randomUUID(), "not-a-uuid"]);
    expect(counts.get(posterA.id)).toBe(2);
    expect(counts.get(posterB.id)).toBe(1);
    expect(counts.size).toBe(2);
    const byStatus = await cv.cvSubmissionCounts(viewer, { requirement: posterA.id });
    expect(Object.values(byStatus).reduce((a, b) => a + b, 0)).toBe(2);
    expect((await cv.listCvSubmissionRequirements(viewer)).find((o) => o.value === posterA.id)?.label).toBe("Dubai - Riggers");
    expect(await cv.getCvRequirementTitle(viewer, posterA.id)).toBe("Dubai - Riggers");

    // Search: passport last 4, phone typed with spaces, email; filters: has CV, source.
    const search = async (q: string, ctx = viewer) => (await cv.listCvSubmissions(ctx, { requirement: posterA.id, q }, page)).items.map((i) => i.id);
    expect(await search("abcd")).toEqual([noCvId]);
    const digits = applicantPhones[1]!.replace("+91", "");
    expect(await search(`${digits.slice(0, 5)} ${digits.slice(5)}`)).toEqual([withCvId]);
    expect(await search("suresh.babu@")).toEqual([noCvId]);
    // A full passport number only matches for staff who may see passport numbers.
    expect(await search("ZX12ABCD")).toEqual([]);
    const documents = await staffContext("candidates.view", "candidates.view_documents", "candidates.view_contact");
    expect(await search("zx12 abcd", documents)).toEqual([noCvId]);
    expect((await cv.listCvSubmissions(viewer, { requirement: posterA.id, cv: "no" }, page)).items.map((i) => i.id)).toEqual([noCvId]);
    expect((await cv.listCvSubmissions(viewer, { requirement: posterA.id, cv: "yes" }, page)).items.map((i) => i.id)).toEqual([withCvId]);
    expect((await cv.listCvSubmissions(viewer, { requirement: posterA.id, source: "import" }, page)).total).toBe(0);

    // Full passport numbers and contact details for staff with the permissions; the list view is logged.
    const full = await cv.listCvSubmissions(documents, { requirement: posterA.id }, page);
    expect(full.items.find((i) => i.id === noCvId)).toMatchObject({ passportDisplay: "ZX12ABCD", passportFull: true, email: "suresh.babu@example.com", phone: applicantPhones[0] });
    const logs = await db
      .select()
      .from(s.dataAccessLogs)
      .where(and(eq(s.dataAccessLogs.actorUserId, documents.user.id), eq(s.dataAccessLogs.subjectId, "list"), eq(s.dataAccessLogs.dataCategory, "identity")));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs[0]!.metadata)).toContain(noCvCode);
  });

  it("copies every applicant's phone number only with the contact permission, and logs it", async () => {
    await expect(cv.listCvSubmissionPhones(await staffContext("candidates.view"), { requirement: posterA.id }, { reason: "test" })).rejects.toBeInstanceOf(ActionError);
    const contact = await staffContext("candidates.view", "candidates.view_contact");
    const { phones, people } = await cv.listCvSubmissionPhones(contact, { requirement: posterA.id }, { reason: "Copied applicant phone numbers for Dubai - Riggers" });
    expect(people).toBe(2);
    expect([...phones].sort()).toEqual([...applicantPhones].sort());
    const [log] = await db
      .select()
      .from(s.dataAccessLogs)
      .where(and(eq(s.dataAccessLogs.actorUserId, contact.user.id), eq(s.dataAccessLogs.accessType, "export")));
    expect(log?.metadata).toMatchObject({ people: 2, numbers: 2 });
  });

  it("exports the applicant rows of one poster with the new fields", async () => {
    const viewer = await staffContext("candidates.view");
    const { rows, total } = await cv.listCvSubmissionsForExport(viewer, { requirement: posterA.id }, 100);
    expect(total).toBe(2);
    expect(rows.find((r) => r.code === noCvCode)).toMatchObject({ email: "suresh.babu@example.com", experienceAbroadYears: 5, experienceIndiaYears: 3, hasCv: false, source: "website", passportLast4: "ABCD" });
  });

  it("shows the missing CV on the status page and in the CV pack, and lets staff attach it later", async () => {
    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.id, noCvId));
    const view = await cv.lookupCvStatus({ phone: row!.phone, reference: noCvCode }, { ipHash: ip() });
    expect(view).toMatchObject({ hasCv: false, reference: noCvCode });

    const docs = await staffContext("candidates.view", "candidates.view_documents");
    const pack = await buildCvSubmissionPack(docs, noCvId, "cv");
    expect(Buffer.from(pack!.bytes.subarray(0, 5)).toString()).toBe("%PDF-");

    const viewer = await staffContext("candidates.view");
    await expect(cv.attachCvSubmissionFile(viewer, { id: noCvId, upload: { data: PDF, name: "cv.pdf", type: "application/pdf" } })).rejects.toBeInstanceOf(ActionError);
    const manager = await staffContext("candidates.view", "candidates.manage", "candidates.view_documents");
    await expect(cv.attachCvSubmissionFile(manager, { id: noCvId, upload: null })).rejects.toMatchObject({ fieldErrors: { cv: [expect.any(String)] } });
    expect(await cv.attachCvSubmissionFile(manager, { id: noCvId, upload: { data: PDF, name: "late-cv.pdf", type: "application/pdf" } })).toEqual({ replaced: false });
    const detail = await cv.getCvSubmission(manager, noCvId);
    expect(detail).toMatchObject({ hasCv: true, cvName: "late-cv.pdf", passportDisplay: "XXXXABCD", passportFull: false });
    const firstFileId = (await db.select({ id: s.cvSubmissions.cvFileId }).from(s.cvSubmissions).where(eq(s.cvSubmissions.id, noCvId)))[0]!.id!;

    expect(await cv.attachCvSubmissionFile(manager, { id: noCvId, upload: { data: PDF, name: "better-cv.pdf", type: "application/pdf" } })).toEqual({ replaced: true });
    const [old] = await db.select().from(s.files).where(eq(s.files.id, firstFileId));
    expect(old!.deletedAt).not.toBeNull();
    const audits = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, noCvId), eq(s.auditLogs.action, "cv_submission.cv_attached")));
    expect(audits).toHaveLength(2);
    expect((await cv.lookupCvStatus({ phone: row!.phone, reference: noCvCode }, { ipHash: ip() })).hasCv).toBe(true);
  });
});
