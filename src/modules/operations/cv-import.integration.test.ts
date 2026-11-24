/**
 * Integration tests for the Excel CV import against an ISOLATED database (vsg_t_*, vsg_r_* or vsg_test_*):
 *   node scripts/test-db.mjs vsg_t_import
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_t_import npx vitest run src/modules/operations/cv-import.integration.test.ts
 */
import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /\/vsg_(?:t|r|test)_[a-z0-9_]+(\?|$)/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("CV Excel import (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_t_*, vsg_r_* or vsg_test_* database", () => undefined);
    return;
  }

  const { and, eq } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { ActionError } = await import("@/lib/actions");
  const { encryptField, hmacToken, tryDecryptField } = await import("@/lib/crypto");
  const { nextCode } = await import("@/lib/codes");
  const imports = await import("./cv-import");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const suffix = randomUUID().slice(0, 6);
  // Not a welding trade: 2,000 rows of it must not crowd the CV-matching suite's welder results in a shared test database.
  const tradeName = `Import scaffolder ${suffix}`;
  let categoryId = "";
  // Unique phones per run: 9 + 9 random-ish digits.
  const base = 600_000_000 + Math.floor(Math.random() * 300_000_000);
  const phone = (i: number) => `9${String(base + i).padStart(9, "0")}`;
  const e164 = (i: number) => `+91${phone(i)}`;
  const passport = (i: number) => `T${String(base + i).slice(-7)}`;

  beforeAll(async () => {
    await db.insert(s.countries).values({ code: "AE", name: "United Arab Emirates" }).onConflictDoNothing();
    const [cat] = await db.insert(s.jobCategories).values({ slug: `import-scaffolder-${suffix}`, name: tradeName }).returning({ id: s.jobCategories.id });
    categoryId = cat!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeStaff(permissions: string[]): Promise<StaffContext> {
    const [u] = await db.insert(s.users).values({ displayName: "Import test", email: `i-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: true }).returning();
    const [role] = await db.insert(s.roles).values({ scope: "platform", key: `i-${randomUUID().slice(0, 12)}`, name: "Test role", permissions }).returning();
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

  async function xlsx(rows: unknown[][]): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("CVs");
    sheet.addRow(["S.No", "Name*", "Phone*", "Trade*", "Passport No", "Passport Expiry (DD-MM-YYYY)", "Exp Abroad (yrs)", "Exp India (yrs)", "Email", "Preferred Country", "Remarks"]);
    rows.forEach((r, i) => sheet.addRow([i + 1, ...r]));
    return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  /** An existing website CV (phone 10, passport of 11 on another phone). */
  async function existingWebsiteCvs() {
    const rows = [
      { phone: e164(10), passport: null as string | null },
      { phone: e164(99), passport: passport(11) },
    ];
    for (const r of rows) {
      await db.insert(s.cvSubmissions).values({
        code: await nextCode("CV"),
        name: "Already here",
        phone: r.phone,
        tradeLabel: tradeName,
        jobCategoryId: categoryId,
        passportNumberEncrypted: r.passport ? encryptField(r.passport) : null,
        passportNumberLast4: r.passport ? r.passport.slice(-4) : null,
        passportNumberHash: r.passport ? hmacToken(r.passport, "passport") : null,
        consentToContact: true,
      });
    }
  }

  it("checks a file without writing, then imports the ready rows with a batch, stage history and audit", async () => {
    await existingWebsiteCvs();
    // May see passport numbers, so they are compared with the CV list too.
    const ctx = await makeStaff(["candidates.view", "candidates.manage", "candidates.view_documents"]);
    const bytes = await xlsx([
      ["Ravi Kumar", phone(1), tradeName.toUpperCase(), passport(1), "15-03-2027", 3, 2, "Ravi@Example.com", "Dubai", "Good TIG welder"],
      ["Suresh", Number(phone(2)), "Crane rigger", "", "", "", "", "", "", ""],
      ["", phone(3), tradeName],
      ["Ravi twice", `+91 ${phone(1)}`, tradeName],
      ["Phone known", phone(10), tradeName],
      ["Passport known", phone(12), tradeName, passport(11)],
    ]);
    const upload = { data: bytes, name: "C:\\Users\\office\\old list.xlsx" };

    const before = await db.$count(s.cvSubmissions);
    const preview = await imports.previewCvImport(ctx, upload);
    expect(await db.$count(s.cvSubmissions)).toBe(before);
    expect(preview.fileName).toBe("old list.xlsx");
    expect(preview.passportsCompared).toBe(true);
    expect(preview.otherSheets).toEqual([]);
    expect(preview.totalRows).toBe(6);
    expect(preview.counts).toEqual({ ready: 2, problem: 1, duplicate: 1, exists: 2 });
    expect(preview.rows.ready.map((r) => r.name)).toEqual(["Ravi Kumar", "Suresh"]);
    expect(preview.rows.ready[0]).toMatchObject({ phone: e164(1), passportLast4: passport(1).slice(-4), tradeListed: true });
    expect(JSON.stringify(preview)).not.toContain(passport(1));
    expect(preview.rows.exists.map((r) => r.reasons[0])).toEqual([expect.stringMatching(/same phone/), expect.stringMatching(/same passport number/)]);

    await expect(imports.runCvImport(ctx, upload, { consent: false })).rejects.toBeInstanceOf(ActionError);
    await expect(imports.runCvImport(ctx, upload, { consent: true, expectedFileHash: "0".repeat(64) })).rejects.toThrow(/changed/);

    const result = await imports.runCvImport(ctx, upload, { consent: true, expectedFileHash: preview.fileHash });
    expect(result).toMatchObject({ fileName: "old list.xlsx", totalRows: 6, created: 2, skipped: 4, listHref: "/admin/cv-submissions?source=import" });

    const [batch] = await db.select().from(s.cvImportBatches).where(eq(s.cvImportBatches.id, result.batchId));
    expect(batch).toMatchObject({ fileName: "old list.xlsx", totalRows: 6, createdCount: 2, skippedCount: 4, createdByUserId: ctx.user.id });

    const created = await db.select().from(s.cvSubmissions).where(eq(s.cvSubmissions.importBatchId, result.batchId));
    expect(created).toHaveLength(2);
    const ravi = created.find((r) => r.name === "Ravi Kumar")!;
    expect(ravi).toMatchObject({
      phone: e164(1),
      jobCategoryId: categoryId,
      tradeLabel: tradeName,
      tradeOther: null,
      source: "import",
      status: "received",
      cvFileId: null,
      consentToContact: true,
      privacyNoticeVersion: "staff-import",
      hasPassport: true,
      passportNumberLast4: passport(1).slice(-4),
      passportNumberHash: hmacToken(passport(1), "passport"),
      passportExpiry: "2027-03-15",
      experienceAbroadYears: 3,
      experienceIndiaYears: 2,
      experienceYears: 5,
      email: "ravi@example.com",
      preferredCountryCode: "AE",
      staffRemarks: "Good TIG welder",
      ipHash: null,
    });
    expect(tryDecryptField(ravi.passportNumberEncrypted)).toBe(passport(1));
    expect(ravi.code).toMatch(/^VSG-CV-\d{6}$/);
    const suresh = created.find((r) => r.name === "Suresh")!;
    expect(suresh).toMatchObject({ phone: e164(2), jobCategoryId: null, tradeLabel: "Crane rigger", tradeOther: "Crane rigger", hasPassport: null, passportNumberHash: null });
    // File order on the newest-first list: row 1 is newer than row 2.
    expect(ravi.createdAt.getTime()).toBeGreaterThan(suresh.createdAt.getTime());

    const events = await db.select().from(s.cvSubmissionStageEvents).where(eq(s.cvSubmissionStageEvents.submissionId, ravi.id));
    expect(events).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "received", changedByUserId: ctx.user.id })]);

    const [log] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "cv_submission.imported"), eq(s.auditLogs.entityId, result.batchId)));
    expect(log?.metadata).toEqual({ totalRows: 6, created: 2, skipped: 4, problems: 1, repeated: 1, alreadyInList: 2 });
    expect(JSON.stringify(log?.metadata)).not.toMatch(/Ravi|old list|\+91/);

    // The same file again: everyone is already in the list now.
    const again = await imports.runCvImport(ctx, upload, { consent: true });
    expect(again).toMatchObject({ created: 0, skipped: 6, counts: { ready: 0, problem: 1, duplicate: 0, exists: 5 } });
  });

  it("compares passport numbers with the CV list only for staff who may see them", async () => {
    // A website CV whose passport number is on another phone.
    const known = passport(70);
    await db.insert(s.cvSubmissions).values({
      code: await nextCode("CV"),
      name: "Known passport",
      phone: e164(71),
      tradeLabel: tradeName,
      passportNumberEncrypted: encryptField(known),
      passportNumberLast4: known.slice(-4),
      passportNumberHash: hmacToken(known, "passport"),
      consentToContact: true,
    });
    const bytes = await xlsx([
      ["Same passport", phone(72), tradeName, known],
      ["Same phone", phone(71), tradeName],
    ]);
    const upload = { data: bytes, name: "recruiter.xlsx" };

    // A recruiter (no candidates.view_documents): a passport match would confirm a number they cannot see.
    const recruiter = await makeStaff(["candidates.view", "candidates.manage", "candidates.view_contact"]);
    const limited = await imports.previewCvImport(recruiter, upload);
    expect(limited.passportsCompared).toBe(false);
    expect(limited.counts).toEqual({ ready: 1, problem: 0, duplicate: 0, exists: 1 });
    expect(limited.rows.exists[0]?.reasons[0]).toMatch(/same phone/);
    expect(JSON.stringify(limited)).not.toMatch(/same passport/);

    const manager = await makeStaff(["candidates.manage", "candidates.view_documents"]);
    const full = await imports.previewCvImport(manager, upload);
    expect(full.passportsCompared).toBe(true);
    expect(full.counts).toEqual({ ready: 0, problem: 0, duplicate: 0, exists: 2 });

    // The import itself follows the same rule.
    const result = await imports.runCvImport(recruiter, upload, { consent: true });
    expect(result).toMatchObject({ created: 1, skipped: 1, counts: { ready: 1, exists: 1 } });
  });

  it("imports a full file of 2,000 people in one go", async () => {
    const ctx = await makeStaff(["candidates.manage"]);
    const rows = Array.from({ length: 2000 }, (_, i) => [`Worker ${i}`, phone(1000 + i), tradeName, passport(5000 + i)]);
    const started = Date.now();
    const result = await imports.runCvImport(ctx, { data: await xlsx(rows), name: "big.xlsx" }, { consent: true });
    expect(result).toMatchObject({ created: 2000, skipped: 0 });
    expect(await db.$count(s.cvSubmissions, eq(s.cvSubmissions.importBatchId, result.batchId))).toBe(2000);
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  it("refuses staff without candidates.manage and unusable files", async () => {
    const viewer = await makeStaff(["candidates.view"]);
    const bytes = await xlsx([["Ravi", phone(40), tradeName]]);
    await expect(imports.previewCvImport(viewer, { data: bytes, name: "a.xlsx" })).rejects.toThrow(/permission/);
    await expect(imports.runCvImport(viewer, { data: bytes, name: "a.xlsx" }, { consent: true })).rejects.toThrow(/permission/);
    const ctx = await makeStaff(["candidates.manage"]);
    await expect(imports.previewCvImport(ctx, { data: new TextEncoder().encode("hello"), name: "a.xlsx" })).rejects.toThrow(/not an Excel file/);
    await expect(imports.previewCvImport(ctx, { data: new Uint8Array(), name: "a.xlsx" })).rejects.toThrow(/Choose your Excel file/);
  });

  it("builds a template that the import reads back", async () => {
    const ctx = await makeStaff(["candidates.manage"]);
    const template = await imports.cvImportTemplate(ctx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(template) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["CVs", "How to fill", "Lists"]);
    const trades: string[] = [];
    wb.getWorksheet("Lists")!.getColumn(1).eachCell((cell, row) => {
      if (row > 1) trades.push(String(cell.value));
    });
    expect(trades).toContain(tradeName);
    // Blank template: header found, no people yet.
    await expect(imports.previewCvImport(ctx, { data: template, name: "template.xlsx" })).rejects.toThrow(/no people/);
  });
});
