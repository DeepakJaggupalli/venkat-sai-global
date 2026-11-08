/**
 * Integration tests for the "Prepare my resume" service against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_docs
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_docs npx vitest run src/modules/resume-service
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "docs-test", "storage-resume"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("Resume service (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });

  const { eq } = await import("drizzle-orm");
  const sharp = (await import("sharp")).default;
  const { PDFDocument } = await import("pdf-lib");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const { setSetting } = await import("@/modules/settings");
  const { getFile } = await import("@/modules/files");
  const service = await import("./service");
  const { resumeRequestSchema } = await import("./schemas");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  beforeAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    await db.insert(s.currencies).values({ code: "INR", name: "Indian rupee", symbol: "₹", minorUnits: 2 }).onConflictDoNothing();
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Resume test", email: `r-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    const [role] = await db.insert(s.roles).values({ scope: "platform", key: `r-${randomUUID().slice(0, 12)}`, name: "Test role", permissions }).returning();
    await db.insert(s.userRoles).values({ userId: u!.id, roleId: role!.id });
    return {
      user: { id: u!.id, email: u!.email, phone: null, emailVerifiedAt: u!.emailVerifiedAt, phoneVerifiedAt: null, displayName: u!.displayName, avatarFileId: null, status: u!.status, isStaff: true, locale: "en", timezone: null, hasPassword: false, twoFactorEnabled: false },
      roleKeys: [role!.key],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  const phone = () => `+9196${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  function request(overrides: Record<string, unknown> = {}) {
    const details = {
      postAppliedFor: "TIG Welder",
      name: "Test Candidate",
      fatherName: "Test Father",
      dateOfBirth: "1990-05-17",
      maritalStatus: "Married",
      nationality: "Indian",
      languages: "English, Hindi, Telugu",
      permanentAddress: "Door 1-2-3\nTest Street\nVisakhapatnam",
      contactPhone: phone(),
      passport: { number: "Z7654321", dateOfIssue: "2018-01-10", dateOfExpiry: "2028-01-09", placeOfIssue: "Visakhapatnam" },
      abroadExperience: [{ organisation: "Test Contracting Co", location: "Jubail, Saudi Arabia", from: "2019-01-01", to: "2021-12-31", current: false, designation: "TIG Welder" }],
      indiaExperience: [{ organisation: "Test Fabricators", location: "Visakhapatnam", from: "2012-06-01", current: true, designation: "Welder" }],
      ...overrides,
    };
    return resumeRequestSchema.parse({ details: JSON.stringify(details), consentToContact: "true", candidateNotes: "Please add my 6G certificate" });
  }

  async function photo(): Promise<{ data: Uint8Array; name: string; type: string }> {
    const data = await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 250, g: 250, b: 250 } } }).jpeg().toBuffer();
    return { data: new Uint8Array(data), name: "photo.jpg", type: "image/jpeg" };
  }

  async function rowByCode(code: string) {
    const [row] = await db.select().from(s.resumeRequests).where(eq(s.resumeRequests.code, code)).limit(1);
    return row!;
  }

  it("creates requests as awaiting payment, with the passport number encrypted and the price snapshot", async () => {
    const first = await service.createResumeRequest(request(), await photo(), { ipHash: `ip-${randomUUID()}` });
    expect(first.status).toBe("awaiting_payment");
    expect(first.priceLabel).toBe("Price on request");
    const row = await rowByCode(first.code!);
    expect(JSON.stringify(row.details)).not.toContain("Z7654321");
    expect(row.passportNumberEncrypted).toBeTruthy();
    expect(row.passportNumberLast4).toBe("4321");
    expect(row.photoFileId).toBeTruthy();
    expect(row.priceAmountMinor).toBeNull();

    await setSetting("resume_service.price", { amountMinor: 49900, currency: "INR" }, null);
    const priced = await service.createResumeRequest(request(), null, { ipHash: `ip-${randomUUID()}` });
    expect(priced.priceLabel).toContain("499");
    expect((await rowByCode(priced.code!)).priceCurrency).toBe("INR");
    await setSetting("resume_service.price", { amountMinor: 0, currency: "" }, null);
  });

  it("drops honeypot submissions silently", async () => {
    const spam = await service.createResumeRequest({ ...request(), website: "http://spam.example" }, null, { ipHash: null });
    expect(spam.code).toBeNull();
  });

  it("generates valid DOCX and PDF once paid, delivers them through a signed link and revokes links on cancel", async () => {
    const manager = await makeStaff(["candidates.manage", "candidates.view"]);
    const outsider = await makeStaff(["candidates.view"]);
    const created = await service.createResumeRequest(request(), await photo(), { ipHash: `ip-${randomUUID()}` });
    const row = await rowByCode(created.code!);

    await expect(service.getResumeRequest(outsider, row.id)).rejects.toBeInstanceOf(ActionError);
    await expect(service.issueResumeDownloadLink(manager, row.id)).rejects.toThrow(/Generate the resume first/);
    await service.markResumeRequestPaid(manager, { id: row.id, method: "offline", reference: "UPI-TEST-1" });

    const detail = await service.getResumeRequest(manager, row.id);
    expect(detail?.status).toBe("generated");
    expect(detail?.details?.passport.number).toBe("Z7654321");
    expect(detail?.paymentReference).toBe("UPI-TEST-1");
    const after = await rowByCode(created.code!);
    const docx = await getFile(after.generatedDocxFileId!);
    const pdf = await getFile(after.generatedPdfFileId!);
    expect(docx?.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(pdf?.mimeType).toBe("application/pdf");

    const link = await service.issueResumeDownloadLink(manager, row.id);
    const token = decodeURIComponent(new URL(link.url).searchParams.get("t")!);
    const view = await service.resolveResumeDownload(token);
    expect(view?.code).toBe(created.code);
    const opened = await service.openResumeDownload(token, "pdf", { ipHash: null });
    const bytes = new Uint8Array(await new Response(opened!.content.body).arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(pages).toBeLessThanOrEqual(2);
    expect((await rowByCode(created.code!)).status).toBe("delivered");

    // A second request: cancelling revokes links issued before.
    const other = await service.createResumeRequest(request(), null, { ipHash: `ip-${randomUUID()}` });
    const otherRow = await rowByCode(other.code!);
    await service.markResumeRequestPaid(manager, { id: otherRow.id, method: "waived" });
    const otherLink = await service.issueResumeDownloadLink(manager, otherRow.id);
    const otherToken = decodeURIComponent(new URL(otherLink.url).searchParams.get("t")!);
    expect(await service.resolveResumeDownload(otherToken)).not.toBeNull();
    await service.setResumeRequestStatus(manager, { id: otherRow.id, status: "cancelled" });
    expect(await service.resolveResumeDownload(otherToken)).toBeNull();
    await expect(service.markResumeRequestPaid(manager, { id: otherRow.id, method: "offline" })).rejects.toBeInstanceOf(ActionError);
  });

  it("lets staff correct details, renders blank templates and lists rows for Excel", async () => {
    const manager = await makeStaff(["candidates.manage"]);
    const created = await service.createResumeRequest(request(), null, { ipHash: `ip-${randomUUID()}` });
    const row = await rowByCode(created.code!);
    const detail = await service.getResumeRequest(manager, row.id);
    await service.updateResumeRequestDetails(manager, { id: row.id, details: { ...detail!.details!, name: "Test Candidate Corrected", passport: { ...detail!.details!.passport, number: "Y1112223" } } });
    const updated = await rowByCode(created.code!);
    expect(updated.name).toBe("Test Candidate Corrected");
    expect(updated.passportNumberLast4).toBe("2223");

    const { rows } = await service.listResumeRequestsWithPassport(manager, { q: created.code! }, 10);
    expect(rows[0]?.passportNumber).toBe("Y1112223");
    expect(rows[0]?.postAppliedFor).toBe("TIG Welder");

    const blankDocx = await service.renderBlankResumeTemplate(manager, "docx");
    expect(Buffer.from(blankDocx.subarray(0, 2)).toString()).toBe("PK");
    const blankPdf = await service.renderBlankResumeTemplate(manager, "pdf");
    expect((await PDFDocument.load(blankPdf)).getPageCount()).toBe(1);
  });
});
