/**
 * Integration tests for the Web Share Target flows against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_share
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_share npx vitest run src/modules/operations/share-submissions
 *   node scripts/test-db.mjs vsg_test_share --drop
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "share", "storage-test"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("shared files: public requirement posters and CVs (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  // env() is read lazily and cached: configure storage before the first call.
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });

  const { and, eq } = await import("drizzle-orm");
  const sharp = (await import("sharp")).default;
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const { getPublishedEntryBySlug } = await import("@/modules/content/queries");
  const shared = await import("@/modules/files/shared-uploads");
  const cv = await import("./cv-submissions");
  const { cvSubmissionSchema } = await import("./cv-submission-schemas");
  const { submitPublicRequirementPoster } = await import("./requirement-poster-submissions");
  const { publicPosterSubmissionSchema } = await import("./requirement-poster-schemas");

  let categoryId = "";
  const phone = () => `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const png = async () => new Uint8Array(await sharp({ create: { width: 60, height: 80, channels: 3, background: "#0ea5e9" } }).png().toBuffer());

  beforeAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    await db.insert(s.countries).values({ code: "AE", name: "United Arab Emirates" }).onConflictDoNothing();
    const [cat] = await db.insert(s.jobCategories).values({ slug: `welder-${randomUUID().slice(0, 6)}`, name: "Welder" }).returning({ id: s.jobCategories.id });
    categoryId = cat!.id;
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  it("turns a public requirement into an unpublished draft awaiting approval plus an employer lead", async () => {
    const contactPhone = phone();
    const input = publicPosterSubmissionSchema.parse({
      companyName: "Gulf Fabrication LLC",
      contactName: "Imran Shaikh",
      phone: contactPhone,
      email: "",
      countryCode: "AE",
      trades: "Mechanical helper - 900 AED\nWelder 6G - 1800 AED",
      notes: "20 workers, food and accommodation provided",
      consentToContact: "on",
    });
    const result = await submitPublicRequirementPoster(input, { data: await png(), name: "poster.png", type: "image/png" }, { ipHash: null });
    expect(result.code).toMatch(/ENQ/);

    const [enquiry] = await db.select().from(s.enquiries).where(eq(s.enquiries.code, result.code!));
    expect(enquiry).toMatchObject({ type: "employer", phone: contactPhone, organizationName: "Gulf Fabrication LLC", sourcePage: "/requirements/submit" });
    expect(enquiry!.leadId).not.toBeNull();
    const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, enquiry!.leadId!));
    expect(lead).toMatchObject({ type: "employer", phone: contactPhone });

    const entryId = /requirement_posts\/([0-9a-f-]{36})/.exec(enquiry!.message)?.[1];
    expect(entryId).toBeTruthy();
    const [entry] = await db.select().from(s.cmsEntries).where(eq(s.cmsEntries.id, entryId!));
    expect(entry).toMatchObject({ collection: "requirement_posts", status: "draft", publishedVersion: null });
    expect(entry!.title).toBe("Mechanical helper - United Arab Emirates");
    // No contact details in the (future) public entry fields.
    const publicFields = JSON.stringify({ title: entry!.title, data: entry!.data });
    expect(publicFields).not.toContain(contactPhone);
    expect(publicFields).not.toContain("Imran");
    expect(await getPublishedEntryBySlug("requirement_posts", entry!.slug)).toBeNull();

    const [approval] = await db
      .select()
      .from(s.approvalRequests)
      .where(and(eq(s.approvalRequests.entityType, "cms_entry"), eq(s.approvalRequests.entityId, entryId!)));
    expect(approval).toMatchObject({ type: "content_publication", status: "pending" });
    expect(approval!.summary).toMatch(/Submitted by the public - check before publishing/);

    const assetId = (entry!.data as { posterAssetId?: string }).posterAssetId!;
    const [asset] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, assetId));
    expect(asset!.visibility).toBe("internal");
    const [poster] = await db.select().from(s.files).where(eq(s.files.id, asset!.fileId!));
    expect(poster).toMatchObject({ purpose: "cms_media", visibility: "private", ownerUserId: null });
  });

  it("spends a shared file token once for a CV submission", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
    const stored = await shared.storeSharedUpload({ data: pdf, name: "my-cv.pdf", type: "application/pdf" }, { ownerUserId: null, ipHash: null, shared: { text: "My CV" } });
    expect(stored.file).toMatchObject({ purpose: "shared_upload", visibility: "private", ownerUserId: null });
    expect((await shared.getSharedUpload(stored.token))?.file.id).toBe(stored.file.id);

    const input = cvSubmissionSchema.parse({ name: "Ravi Kumar", phone: phone(), trade: categoryId, consentToContact: "true" });
    const result = await cv.submitCvSubmission(input, { sharedToken: stored.token }, { ipHash: null });
    expect(result.code).toMatch(/CV/);

    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.code, result.code!));
    expect(row!.cvFileId).toBe(stored.file.id);
    const [file] = await db.select().from(s.files).where(eq(s.files.id, stored.file.id));
    expect(file).toMatchObject({ purpose: "cv_submission", visibility: "private", ownerUserId: null });
    expect((file!.metadata as Record<string, unknown>).sharedText).toBeUndefined();

    // One-time use: the token no longer opens anything and cannot be sent again.
    expect(await shared.getSharedUpload(stored.token)).toBeNull();
    const again = cvSubmissionSchema.parse({ name: "Ravi Kumar", phone: phone(), trade: categoryId, consentToContact: "true" });
    await expect(cv.submitCvSubmission(again, { sharedToken: stored.token }, { ipHash: null })).rejects.toBeInstanceOf(ActionError);
    await expect(cv.submitCvSubmission(again, { sharedToken: stored.token }, { ipHash: null })).rejects.toMatchObject({ fieldErrors: { cv: [expect.stringMatching(/expired|already/)] } });
  });

  it("uses a shared poster photo once and deletes unused shared files after 2 hours", async () => {
    const photo = await shared.storeSharedUpload({ data: await png(), name: "whatsapp.png", type: "image/png" }, { ownerUserId: null, ipHash: null });
    const input = publicPosterSubmissionSchema.parse({ companyName: "Desert Build", contactName: "Sara", phone: phone(), shared: photo.token, consentToContact: "on" });
    const result = await submitPublicRequirementPoster(input, null, { ipHash: null });
    expect(result.code).toMatch(/ENQ/);
    const [holding] = await db.select().from(s.files).where(eq(s.files.id, photo.file.id));
    expect(holding!.deletedAt).not.toBeNull();
    await expect(submitPublicRequirementPoster({ ...input, phone: phone() }, null, { ipHash: null })).rejects.toMatchObject({ fieldErrors: { poster: [expect.any(String)] } });

    const unused = await shared.storeSharedUpload({ data: await png(), name: "later.png", type: "image/png" }, { ownerUserId: null, ipHash: null });
    expect(await shared.expireSharedUpload(unused.file.id)).toBe("not_due");
    expect(await shared.expireSharedUpload(unused.file.id, new Date(Date.now() + 121 * 60_000))).toBe("expired");
    const [gone] = await db.select().from(s.files).where(eq(s.files.id, unused.file.id));
    expect(gone!.deletedAt).not.toBeNull();
    expect((gone!.metadata as Record<string, unknown>).purgedAt).toBeTruthy();
  });
});
