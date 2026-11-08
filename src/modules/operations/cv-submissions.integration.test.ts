/**
 * Integration tests for "Send your CV" and phone poster publishing against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_posters
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_posters npx vitest run src/modules/operations/cv-submissions src/modules/recruitment-posters
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "posters", "storage-test"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("CV submissions and requirement posters (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  // env() is read lazily and cached: configure storage before the first call.
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });

  const { and, eq, gte, sql } = await import("drizzle-orm");
  const sharp = (await import("sharp")).default;
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const { storeFile } = await import("@/modules/files");
  const { getPublishedEntryBySlug } = await import("@/modules/content/queries");
  const cv = await import("./cv-submissions");
  const { cvSubmissionSchema } = await import("./cv-submission-schemas");
  const posters = await import("@/modules/recruitment-posters/service");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const startedAt = new Date(Date.now() - 1000);
  const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  let categoryId = "";

  beforeAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    await db.insert(s.countries).values({ code: "AE", name: "United Arab Emirates" }).onConflictDoNothing();
    const [cat] = await db
      .insert(s.jobCategories)
      .values({ slug: `mechanical-helper-${randomUUID().slice(0, 6)}`, name: "Mechanical helper" })
      .returning({ id: s.jobCategories.id });
    categoryId = cat!.id;
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Poster test", email: `p-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    const [role] = await db.insert(s.roles).values({ scope: "platform", key: `p-${randomUUID().slice(0, 12)}`, name: "Test role", permissions }).returning();
    await db.insert(s.userRoles).values({ userId: u!.id, roleId: role!.id });
    return {
      user: {
        id: u!.id,
        email: u!.email,
        phone: null,
        emailVerifiedAt: u!.emailVerifiedAt,
        phoneVerifiedAt: null,
        displayName: u!.displayName,
        avatarFileId: null,
        status: u!.status,
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: false,
        twoFactorEnabled: false,
      },
      roleKeys: [role!.key],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  function phone(): string {
    return `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  }

  function input(overrides: Record<string, unknown> = {}) {
    return cvSubmissionSchema.parse({ name: "Ravi Kumar", phone: phone(), trade: categoryId, consentToContact: "true", ...overrides });
  }

  async function posterFile(ownerUserId: string) {
    const png = await sharp({ create: { width: 60, height: 80, channels: 3, background: "#ffffff" } }).png().toBuffer();
    return storeFile({ data: new Uint8Array(png), originalName: "hiap-seng.png", declaredMimeType: "image/png", purpose: "cms_media", ownerUserId, visibility: "private" });
  }

  let posterSlug = "";
  let submittedId = "";

  it("publishes a poster in one step (media item + entry + publication)", async () => {
    const ctx = await makeStaff(["content.view", "content.edit", "content.publish", "media.manage"]);
    const file = await posterFile(ctx.user.id);
    const result = await posters.quickPublishPoster(ctx, {
      fileId: file.id,
      title: "Dubai - Mechanical helper",
      countryCode: "AE",
      trades: "Mechanical helper - 900 AED + food allowance 350 AED",
      benefits: "Free accommodation\nMedical",
    });
    expect(result.publishError).toBeNull();
    expect(result.outcome?.outcome).toBe("published");
    posterSlug = result.slug;
    const detail = await getPublishedEntryBySlug("requirement_posts", result.slug);
    expect(detail?.entry.data.countryCode).toBe("AE");
    expect(detail?.entry.data.trades).toEqual([{ trade: "Mechanical helper", salary: "900 AED + food allowance 350 AED", currency: "AED" }]);
    expect(detail?.entry.data.benefits).toEqual(["Free accommodation", "Medical"]);
    // The poster image resolves publicly (public media item, public file).
    expect(detail?.assets[detail.entry.data.posterAssetId]?.kind).toBe("image");

    // Retrying with the same upload reuses the media item instead of failing on the unique file.
    const again = await posters.quickPublishPoster(ctx, { fileId: file.id });
    expect(again.outcome?.outcome).toBe("published");
    expect(again.slug).toMatch(/^new-requirement/);

    const list = await posters.listPosters(ctx, {}, { page: 1, pageSize: 10, offset: 0 });
    expect(list.items.map((p) => p.slug)).toContain(result.slug);
  });

  it("sends a poster for approval when the editor cannot publish, and refuses someone else's upload", async () => {
    const editor = await makeStaff(["content.view", "content.edit", "media.manage"]);
    const file = await posterFile(editor.user.id);
    const result = await posters.quickPublishPoster(editor, { fileId: file.id });
    expect(result.outcome?.outcome).toBe("submitted_for_approval");

    const other = await makeStaff(["content.view", "content.edit", "content.publish", "media.manage"]);
    await expect(posters.quickPublishPoster(other, { fileId: file.id })).rejects.toBeInstanceOf(ActionError);
    await expect(posters.quickPublishPoster(await makeStaff(["content.view"]), { fileId: file.id })).rejects.toThrow(/permission/);
  });

  it("records a CV with its private file, links the requirement and notifies staff and the business inbox", async () => {
    const result = await cv.submitCvSubmission(
      input({ requirement: posterSlug, preferredCountryCode: "ae", experienceYears: "5", passportNumber: "z 123-4567", candidateNotes: "Gulf experience, 2 years" }),
      { data: PDF, name: "cv.pdf", type: "application/pdf" },
      { ipHash: `ip-${randomUUID()}` },
    );
    expect(result.code).toMatch(/CV/);
    expect(result.trade).toBe("Mechanical helper");
    expect(result.requirementTitle).toBe("Dubai - Mechanical helper");

    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.code, result.code!));
    expect(row).toMatchObject({ status: "new", experienceYears: 5, preferredCountryCode: "AE", hasPassport: true, consentToContact: true });
    expect(row!.requirementEntryId).not.toBeNull();
    // Passport number: encrypted at rest, last 4 for display, blind index for matching.
    expect(row).toMatchObject({ passportNumberLast4: "4567", candidateNotes: "Gulf experience, 2 years" });
    expect(row!.passportNumberEncrypted).toBeTruthy();
    expect(row!.passportNumberEncrypted).not.toContain("Z1234567");
    expect(row!.passportNumberHash).toBeTruthy();
    submittedId = row!.id;
    const [file] = await db.select().from(s.files).where(eq(s.files.id, row!.cvFileId));
    expect(file).toMatchObject({ purpose: "cv_submission", ownerUserId: null, visibility: "private", mimeType: "application/pdf" });

    const jobs = await db
      .select()
      .from(s.backgroundJobs)
      .where(and(gte(s.backgroundJobs.createdAt, startedAt), sql`${s.backgroundJobs.payload}->>'event' = 'cv.received'`));
    const payloads = jobs.map((j) => JSON.stringify(j.payload));
    expect(payloads.some((p) => p.includes("vsweld@gmail.com") && p.includes(row!.phone))).toBe(true);
    expect(payloads.some((p) => p.includes("candidates.manage") && !p.includes(row!.phone))).toBe(true);
  });

  it("accepts an 'Other' trade and drops honeypot submissions silently", async () => {
    const other = await cv.submitCvSubmission(input({ trade: "other", tradeOther: "Rigger level 2" }), { data: PDF, name: "cv.pdf", type: "application/pdf" }, { ipHash: null });
    expect(other.trade).toBe("Rigger level 2");
    const bot = await cv.submitCvSubmission(input({ website: "spam" }), { data: PDF, name: "cv.pdf", type: "application/pdf" }, { ipHash: null });
    expect(bot.code).toBeNull();
  });

  it("rejects missing, oversized and disguised CV files", async () => {
    await expect(cv.submitCvSubmission(input(), null, { ipHash: null })).rejects.toMatchObject({ fieldErrors: { cv: [expect.any(String)] } });
    await expect(cv.submitCvSubmission(input(), { data: new Uint8Array(4 * 1024 * 1024 + 1), name: "big.pdf", type: "application/pdf" }, { ipHash: null })).rejects.toMatchObject({
      fieldErrors: { cv: [expect.stringMatching(/4 MB/)] },
    });
    const fake = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    await expect(cv.submitCvSubmission(input(), { data: fake, name: "cv.pdf", type: "application/pdf" }, { ipHash: null })).rejects.toMatchObject({ fieldErrors: { cv: [expect.any(String)] } });
  });

  it("rate limits repeated CVs from one phone number", async () => {
    const same = phone();
    for (let i = 0; i < 3; i++) await cv.submitCvSubmission(input({ phone: same }), { data: PDF, name: "cv.pdf", type: "application/pdf" }, { ipHash: null });
    await expect(cv.submitCvSubmission(input({ phone: same }), { data: PDF, name: "cv.pdf", type: "application/pdf" }, { ipHash: null })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("lists CVs with masked or visible contact details by permission and updates the status", async () => {
    const viewer = await makeStaff(["candidates.view"]);
    const masked = await cv.listCvSubmissions(viewer, {}, { page: 1, pageSize: 50, offset: 0 });
    expect(masked.items.length).toBeGreaterThan(0);
    expect(masked.items.every((i) => i.phone === null && i.cvUrl === null)).toBe(true);

    const recruiter = await makeStaff(["candidates.view", "candidates.view_contact", "candidates.manage", "recruitment.manage"]);
    const full = await cv.listCvSubmissions(recruiter, { trade: categoryId }, { page: 1, pageSize: 50, offset: 0 });
    const item = full.items[0]!;
    expect(item.phone).toMatch(/^\+91/);
    expect(item.cvUrl).toMatch(/^\/api\/v1\/files\//);
    expect(full.items.every((i) => i.tradeLabel === "Mechanical helper")).toBe(true);

    await expect(cv.setCvSubmissionStatus(viewer, { id: item.id, status: "contacted" })).rejects.toBeInstanceOf(ActionError);
    await cv.setCvSubmissionStatus(recruiter, { id: item.id, status: "shortlisted" });
    await expect(cv.setCvSubmissionRemarks(viewer, { id: item.id, remarks: "x" })).rejects.toBeInstanceOf(ActionError);
    await cv.setCvSubmissionRemarks(recruiter, { id: item.id, remarks: "Called, has passport" });
    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.id, item.id));
    expect(row!.status).toBe("shortlisted");
    expect(row!.contactedAt).not.toBeNull();
    expect(row!.staffRemarks).toBe("Called, has passport");
    expect(row!.remarksUpdatedByUserId).toBe(recruiter.user.id);
    const counts = await cv.cvSubmissionCounts(recruiter);
    expect(counts.shortlisted).toBeGreaterThanOrEqual(1);
  });

  it("reveals the full passport number only with candidates.view_documents and logs the reveal", async () => {
    const recruiter = await makeStaff(["candidates.view", "candidates.view_contact"]);
    const listed = await cv.getCvSubmission(recruiter, submittedId, { revealPassport: true });
    expect(listed).toMatchObject({ passportLast4: "4567", passportNumber: null, canRevealPassport: false, candidateNotes: "Gulf experience, 2 years" });

    const ops = await makeStaff(["candidates.view", "candidates.view_documents"]);
    expect((await cv.getCvSubmission(ops, submittedId))?.passportNumber).toBeNull();
    const revealed = await cv.getCvSubmission(ops, submittedId, { revealPassport: true });
    expect(revealed?.passportNumber).toBe("Z1234567");
    const logs = await db
      .select()
      .from(s.dataAccessLogs)
      .where(and(eq(s.dataAccessLogs.subjectId, submittedId), eq(s.dataAccessLogs.accessType, "reveal"), eq(s.dataAccessLogs.actorUserId, ops.user.id)));
    expect(logs).toHaveLength(1);
  });
});
