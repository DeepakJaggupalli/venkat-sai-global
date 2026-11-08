/**
 * Integration tests for CV submission documents, the CV / visa pack and the CV submissions Excel rows, against an
 * ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_docs
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_docs npx vitest run src/modules/operations/cv-submission-documents
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "docs-test", "storage-cvdocs"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("CV submission documents and packs (PostgreSQL)", async () => {
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
  const cv = await import("./cv-submissions");
  const docs = await import("./cv-submission-documents");
  const { buildCvSubmissionPack } = await import("./cv-pack");
  const { cvSubmissionSchema } = await import("./cv-submission-schemas");
  const { exportVisibility, formatPassport } = await import("@/modules/exports/people");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  let categoryId = "";

  beforeAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    const [cat] = await db.insert(s.jobCategories).values({ slug: `tig-welder-${randomUUID().slice(0, 6)}`, name: "TIG welder" }).returning({ id: s.jobCategories.id });
    categoryId = cat!.id;
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Docs test", email: `d-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    const [role] = await db.insert(s.roles).values({ scope: "platform", key: `d-${randomUUID().slice(0, 12)}`, name: "Test role", permissions }).returning();
    await db.insert(s.userRoles).values({ userId: u!.id, roleId: role!.id });
    return {
      user: { id: u!.id, email: u!.email, phone: null, emailVerifiedAt: u!.emailVerifiedAt, phoneVerifiedAt: null, displayName: u!.displayName, avatarFileId: null, status: u!.status, isStaff: true, locale: "en", timezone: null, hasPassword: false, twoFactorEnabled: false },
      roleKeys: [role!.key],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  const phone = () => `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  async function pdf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`Test page ${i + 1}`, { x: 50, y: 780, size: 18 });
    return doc.save();
  }

  async function image(format: "png" | "jpeg", width = 800, height = 1100): Promise<Uint8Array> {
    const img = sharp({ create: { width, height, channels: 3, background: { r: 230, g: 230, b: 240 } } });
    return new Uint8Array(await (format === "png" ? img.png() : img.jpeg()).toBuffer());
  }

  async function submit() {
    const input = cvSubmissionSchema.parse({ name: "Test Candidate", phone: phone(), trade: categoryId, passportNumber: "Z1234567", consentToContact: "true" });
    const result = await cv.submitCvSubmission(input, { data: await pdf(2), name: "cv.pdf", type: "application/pdf" }, { ipHash: `ip-${randomUUID()}`, sourcePage: "/send-cv" });
    const [row] = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.code, result.code!)).limit(1);
    return { result, id: row!.id };
  }

  it("issues an upload token with the submission and accepts one document per upload", async () => {
    const { result, id } = await submit();
    expect(result.uploadToken).toBeTruthy();
    const link = await docs.resolveCvDocumentLink(result.uploadToken);
    expect(link?.id).toBe(id);
    expect(link?.firstName).toBe("Test");

    const candidate = { kind: "candidate" as const, token: result.uploadToken!, ipHash: `ip-${randomUUID()}` };
    await docs.addCvSubmissionDocument(candidate, { kind: "certificate", upload: { data: await image("png"), name: "cert.png", type: "image/png" } });
    await docs.addCvSubmissionDocument(candidate, { kind: "passport_cover", upload: { data: await image("jpeg"), name: "cover.jpg", type: "image/jpeg" } });
    await docs.addCvSubmissionDocument(candidate, { kind: "photo", upload: { data: await image("jpeg", 400, 500), name: "photo.jpg", type: "image/jpeg" } });
    // A second photo replaces the first.
    await docs.addCvSubmissionDocument(candidate, { kind: "photo", upload: { data: await image("png", 400, 500), name: "photo2.png", type: "image/png" } });

    const listed = await docs.listDocumentsForLink(id);
    expect(listed.filter((d) => d.kind === "photo")).toHaveLength(1);
    expect(listed.find((d) => d.kind === "photo")?.fileName).toBe("photo2.png");
    expect(listed).toHaveLength(3);
  });

  it("rejects forged or missing links and oversized files", async () => {
    await expect(docs.addCvSubmissionDocument({ kind: "candidate", token: "forged.token", ipHash: null }, { kind: "other", upload: { data: await image("png"), name: "x.png", type: "image/png" } })).rejects.toBeInstanceOf(ActionError);
    const { result } = await submit();
    const big = new Uint8Array(4 * 1024 * 1024 + 10);
    await expect(docs.addCvSubmissionDocument({ kind: "candidate", token: result.uploadToken!, ipHash: null }, { kind: "other", upload: { data: big, name: "big.pdf", type: "application/pdf" } })).rejects.toThrow(/larger than 4 MB/);
  });

  it("lets staff add, reorder and delete documents, and builds the CV and visa packs in order", async () => {
    const { id } = await submit();
    const manager = await makeStaff(["candidates.view", "candidates.manage", "candidates.view_documents"]);
    const viewerOnly = await makeStaff(["candidates.view"]);
    const staff = { kind: "staff" as const, ctx: manager };
    const first = await docs.addCvSubmissionDocument(staff, { submissionId: id, kind: "certificate", upload: { data: await image("png"), name: "first.png", type: "image/png" } });
    const second = await docs.addCvSubmissionDocument(staff, { submissionId: id, kind: "certificate", upload: { data: await image("jpeg"), name: "second.jpg", type: "image/jpeg" } });
    await docs.addCvSubmissionDocument(staff, { submissionId: id, kind: "licence", upload: { data: await pdf(2), name: "licence.pdf", type: "application/pdf" } });
    await docs.addCvSubmissionDocument(staff, { submissionId: id, kind: "passport_first_page", upload: { data: await image("jpeg"), name: "first-page.jpg", type: "image/jpeg" } });
    const extra = await docs.addCvSubmissionDocument(staff, { submissionId: id, kind: "other", upload: { data: await image("png"), name: "extra.png", type: "image/png" } });
    await expect(docs.addCvSubmissionDocument({ kind: "staff", ctx: viewerOnly }, { submissionId: id, kind: "other", upload: { data: await image("png"), name: "x.png", type: "image/png" } })).rejects.toBeInstanceOf(ActionError);

    await docs.moveCvSubmissionDocument(manager, { id: second.id, direction: "up" });
    let list = await docs.listCvSubmissionDocuments(manager, id);
    expect(list.filter((d) => d.kind === "certificate").map((d) => d.fileName)).toEqual(["second.jpg", "first.png"]);
    expect(list.every((d) => d.url)).toBe(true);
    expect((await docs.listCvSubmissionDocuments(viewerOnly, id)).every((d) => d.url === null)).toBe(true);

    await docs.deleteCvSubmissionDocument(manager, { id: extra.id });
    list = await docs.listCvSubmissionDocuments(manager, id);
    expect(list.map((d) => d.id)).not.toContain(extra.id);
    expect(list.map((d) => d.id)).toContain(first.id);

    const pack = await buildCvSubmissionPack(manager, id, "cv");
    expect(pack).not.toBeNull();
    expect(Buffer.from(pack!.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(pack!.bytes);
    // CV (2 pages) + 2 certificates + licence (2 pages) + passport first page.
    expect(loaded.getPageCount()).toBe(2 + 2 + 2 + 1);
    expect(pack!.filename).toMatch(/^venkat-sai-cv-pack-vsg-cv-\d+-test-candidate\.pdf$/);
    const visa = await buildCvSubmissionPack(manager, id, "visa");
    expect((await PDFDocument.load(visa!.bytes)).getTitle()).toMatch(/^Visa pack/);
    await expect(buildCvSubmissionPack(viewerOnly, id, "cv")).rejects.toBeInstanceOf(ActionError);

    const logs = await db.select().from(s.dataAccessLogs).where(eq(s.dataAccessLogs.subjectId, id));
    expect(logs.some((l) => l.accessType === "download" && l.reason === "CV pack PDF")).toBe(true);
  });

  it("issues a 7-day staff upload link", async () => {
    const { id } = await submit();
    const manager = await makeStaff(["candidates.view", "candidates.manage"]);
    const link = await docs.issueCvDocumentUploadLink(manager, id);
    expect(link.url).toContain("/send-cv/documents?t=");
    expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 3600 * 1000);
    const token = decodeURIComponent(new URL(link.url).searchParams.get("t")!);
    expect((await docs.resolveCvDocumentLink(token))?.id).toBe(id);
  });

  it("returns export rows and masks passport numbers without the documents permission", async () => {
    const { result } = await submit();
    const full = await makeStaff(["candidates.view", "candidates.view_contact", "candidates.view_documents"]);
    const basic = await makeStaff(["candidates.view"]);
    const { rows, total } = await cv.listCvSubmissionsForExport(full, { q: result.code! }, 100);
    expect(total).toBe(1);
    const row = rows[0]!;
    expect(formatPassport(exportVisibility(full), row.passportEncrypted, row.passportLast4)).toBe("Z1234567");
    expect(formatPassport(exportVisibility(basic), row.passportEncrypted, row.passportLast4)).toBe("XXXX4567");
  });
});
