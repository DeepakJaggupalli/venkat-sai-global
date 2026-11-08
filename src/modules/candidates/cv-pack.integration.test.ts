/**
 * Candidate CV / visa pack and Excel person columns against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_docs
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/vsg_test_docs npx vitest run src/modules/candidates/cv-pack
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "docs-test", "storage-candpack"));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("Candidate pack and export columns (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });

  const sharp = (await import("sharp")).default;
  const { PDFDocument } = await import("pdf-lib");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const { encryptField } = await import("@/lib/crypto");
  const { storeFile } = await import("@/modules/files");
  const { buildCandidatePack } = await import("./cv-pack");
  const { candidatePeople } = await import("@/modules/exports/people");
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  beforeAll(async () => fs.rm(STORAGE_DIR, { recursive: true, force: true }));
  afterAll(async () => {
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  function staff(permissions: string[], id: string): StaffContext {
    return {
      user: { id, email: null, phone: null, emailVerifiedAt: null, phoneVerifiedAt: null, displayName: "Staff", avatarFileId: null, status: "active", isStaff: true, locale: "en", timezone: null, hasPassword: false, twoFactorEnabled: false },
      roleKeys: [],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    } as StaffContext;
  }

  it("orders resume, passport and photo; masks phone and passport per permission", async () => {
    const [user] = await db.insert(s.users).values({ displayName: "Test Candidate", email: `c-${randomUUID()}@vsg-test.invalid`, phone: `+9195${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` }).returning();
    const [staffUser] = await db.insert(s.users).values({ displayName: "Staff", email: `s-${randomUUID()}@vsg-test.invalid`, isStaff: true }).returning();
    const resumeDoc = await PDFDocument.create();
    resumeDoc.addPage();
    const resume = await storeFile({ data: await resumeDoc.save(), originalName: "resume.pdf", declaredMimeType: "application/pdf", purpose: "resume", ownerUserId: user!.id });
    const jpeg = new Uint8Array(await sharp({ create: { width: 600, height: 800, channels: 3, background: "#eeeeee" } }).jpeg().toBuffer());
    const passport = await storeFile({ data: jpeg, originalName: "passport.jpg", declaredMimeType: "image/jpeg", purpose: "candidate_document", ownerUserId: user!.id });
    const [profile] = await db
      .insert(s.candidateProfiles)
      .values({ userId: user!.id, resumeFileId: resume.id, currentJobTitle: "Pipe fitter", about: "Ten years in refineries", passportNumberEncrypted: encryptField("P9876543"), passportNumberLast4: "6543" })
      .returning();
    await db.insert(s.candidateDocuments).values({ candidateId: profile!.id, documentType: "passport", fileId: passport.id, uploadedByUserId: user!.id });

    const full = staff(["candidates.view", "candidates.view_documents", "candidates.view_contact"], staffUser!.id);
    const pack = await buildCandidatePack(full, profile!.id, "visa");
    const loaded = await PDFDocument.load(pack!.bytes);
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getTitle()).toBe("Visa pack - Test Candidate");
    await expect(buildCandidatePack(staff(["candidates.view"], staffUser!.id), profile!.id, "cv")).rejects.toThrow();

    const people = await candidatePeople(full, [profile!.id]);
    expect(people.get(profile!.id)).toMatchObject({ name: "Test Candidate", trade: "Pipe fitter", passport: "P9876543", phone: user!.phone, candidateNotes: "Ten years in refineries" });
    const masked = await candidatePeople(staff(["candidates.view"], staffUser!.id), [profile!.id]);
    expect(masked.get(profile!.id)?.passport).toBe("XXXX6543");
    expect(masked.get(profile!.id)?.phone).not.toBe(user!.phone);
  });
});
