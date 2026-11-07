/**
 * Integration tests for the storage pipeline (local driver + PostgreSQL). They only run against an
 * isolated test database (DATABASE_URL containing "vsg_test_"):
 *   node scripts/test-db.mjs vsg_test_infra
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_infra'; npx vitest run src/modules/files
 */
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(process.env.VSG_TEST_STORAGE_DIR ?? path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "infra", "storage-test"));

describe.skipIf(!enabled)("files service (local storage + PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  // env() is read lazily and cached: configure storage before the first call.
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "" });
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });

  const { eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { files, users } = await import("@/db/schema");
  const service = await import("./service");
  const access = await import("./access");

  const [owner] = await db.insert(users).values({ displayName: "Owner (test)", email: `owner-${Date.now()}@vsg-test.invalid` }).returning({ id: users.id });
  const [other] = await db.insert(users).values({ displayName: "Other (test)", email: `other-${Date.now()}@vsg-test.invalid` }).returning({ id: users.id });
  const ownerId = owner!.id;
  const otherId = other!.id;

  afterAll(async () => {
    await db.execute(sql`delete from background_jobs where type like 'files.%'`);
    await db.execute(sql`delete from files where owner_user_id in (${ownerId}, ${otherId})`);
    await db.execute(sql`delete from users where id in (${ownerId}, ${otherId})`);
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  const onDisk = async (key: string) => fs.readFile(path.join(STORAGE_DIR, ...key.split("/"))).catch(() => null);

  it("stores a photo with EXIF/GPS stripped, auto-rotated, with WebP variants", async () => {
    const base = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#16a6a1" } }).jpeg().toBuffer();
    const photo = await sharp(base)
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { ImageDescription: "secret" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "17/1 41/1 0/1" } })
      .jpeg()
      .toBuffer();
    const row = await service.storeFile({ data: photo, originalName: "IMG_0001.JPG", declaredMimeType: "image/jpeg", purpose: "avatar", ownerUserId: ownerId });

    expect(row).toMatchObject({ purpose: "avatar", mimeType: "image/jpeg", visibility: "private", scanStatus: "not_scanned", width: 600, height: 1200, storageDriver: "local" });
    expect(row.originalName).toBe("IMG_0001.JPG");
    expect(row.storageKey).toMatch(new RegExp(`^\\d{4}/\\d{2}/${row.id}$`));
    expect(Object.keys(row.variants).sort()).toEqual(["md", "thumb"]);
    expect(row.metadata).toMatchObject({ metadataStripped: true, processing: "complete" });

    const stored = await onDisk(row.storageKey);
    expect(stored).not.toBeNull();
    const meta = await sharp(stored!).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(row.sizeBytes).toBe(stored!.byteLength);
    const thumb = await onDisk(row.variants.thumb!.key);
    expect((await sharp(thumb!).metadata()).format).toBe("webp");

    const content = await service.openFileContent(row, "thumb");
    expect(content?.variant).toBe("thumb");
    expect(content?.mimeType).toBe("image/webp");
    await content?.body.cancel();
  });

  it("stores documents as-is and rejects content that does not match its name", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    const row = await service.storeFile({ data: pdf, originalName: "Ravi CV.pdf", declaredMimeType: "application/pdf", purpose: "resume", ownerUserId: ownerId });
    expect(row).toMatchObject({ mimeType: "application/pdf", sizeBytes: pdf.byteLength, variants: {} });

    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } }).png().toBuffer();
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(files);
    await expect(service.storeFile({ data: png, originalName: "photo.jpg", declaredMimeType: "image/jpeg", purpose: "avatar", ownerUserId: ownerId })).rejects.toMatchObject({
      name: "FileValidationError",
      code: "type_mismatch",
      status: 415,
    });
    await expect(service.storeFile({ data: Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]), originalName: "cv.pdf", purpose: "resume", ownerUserId: ownerId })).rejects.toMatchObject({ code: "dangerous" });
    await expect(service.storeFile({ data: pdf, originalName: "cv.pdf", purpose: "resume", ownerUserId: ownerId, visibility: "public" })).rejects.toMatchObject({ code: "visibility_not_allowed" });
    await expect(service.storeFile({ data: Buffer.alloc(0), originalName: "empty.pdf", purpose: "resume", ownerUserId: ownerId })).rejects.toMatchObject({ code: "empty" });
    await expect(service.storeFile({ data: Buffer.alloc(5 * 1024 * 1024 + 1, 1), originalName: "big.jpg", purpose: "avatar", ownerUserId: ownerId })).rejects.toMatchObject({ code: "too_large", status: 413 });
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(files);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("accepts clean SVG for CMS media and rejects SVG with scripts", async () => {
    const clean = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"><rect width="48" height="24" fill="#16a6a1"/></svg>');
    const row = await service.storeFile({ data: clean, originalName: "badge.svg", declaredMimeType: "image/svg+xml", purpose: "cms_media", ownerUserId: ownerId });
    expect(row).toMatchObject({ mimeType: "image/svg+xml", visibility: "public", width: 48, height: 24 });
    const evil = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');
    await expect(service.storeFile({ data: evil, originalName: "x.svg", purpose: "cms_media", ownerUserId: ownerId })).rejects.toMatchObject({ code: "dangerous" });
  });

  it("validates file ids received from forms", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
    const row = await service.storeFile({ data: pdf, originalName: "cert.pdf", purpose: "candidate_credential", ownerUserId: ownerId });
    await expect(service.requireUploadedFile(row.id, { purposes: ["candidate_credential"], ownerUserId: ownerId })).resolves.toMatchObject({ id: row.id });
    await expect(service.requireUploadedFile(row.id, { purposes: ["resume"], ownerUserId: ownerId })).rejects.toThrow(/cannot be used here/);
    await expect(service.requireUploadedFile(row.id, { purposes: ["candidate_credential"], ownerUserId: otherId })).rejects.toThrow(/cannot be used here/);
    await expect(service.requireUploadedFile("00000000-0000-4000-8000-000000000000", { purposes: ["resume"] })).rejects.toThrow(/could not be found/);
    expect(await service.getFile("not-a-uuid")).toBeNull();
  });

  it("controls access with owner rules and explicit, revocable grants", async () => {
    const row = await service.storeFile({ data: Buffer.from("%PDF-1.4\n%%EOF\n"), originalName: "cv.pdf", purpose: "resume", ownerUserId: ownerId });
    const ownerViewer = await access.loadFileViewer(ownerId);
    const otherViewer = await access.loadFileViewer(otherId);
    expect(await access.checkFileAccess(ownerViewer, row)).toMatchObject({ allowed: true, via: "owner" });
    expect(await access.checkFileAccess(otherViewer, row)).toEqual({ allowed: false, reason: "forbidden" });
    expect(await access.checkFileAccess(null, row)).toEqual({ allowed: false, reason: "unauthenticated" });

    const g1 = await access.grantFileAccess({ fileId: row.id, granteeUserId: otherId, reason: "Application to job (test)", contextType: "application", contextId: row.id, grantedByUserId: ownerId });
    const g2 = await access.grantFileAccess({ fileId: row.id, granteeUserId: otherId, reason: "Application to job (test)", contextType: "application", contextId: row.id, grantedByUserId: ownerId });
    expect(g1.created).toBe(true);
    expect(g2).toEqual({ id: g1.id, created: false });
    expect(await access.canAccessFile(otherViewer, row)).toBe(true);

    expect(await access.revokeFileAccess({ fileId: row.id, granteeUserId: otherId }, { revokedByUserId: ownerId })).toBe(1);
    expect(await access.canAccessFile(otherViewer, row)).toBe(false);
    expect((await access.listFileGrants(row.id))[0]?.revokedAt).toBeInstanceOf(Date);
  });

  it("refuses to share data exports", async () => {
    const row = await service.storeFile({ data: Buffer.from('{"profile":{}}'), originalName: "export.json", purpose: "data_export", ownerUserId: ownerId });
    await expect(access.grantFileAccess({ fileId: row.id, granteeUserId: otherId, reason: "should fail" })).rejects.toThrow(/cannot be shared/);
  });

  it("defers variants to files.process when asked and completes them in the task", async () => {
    const img = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#123456" } }).png().toBuffer();
    const row = await service.storeFile({ data: img, originalName: "work.png", purpose: "portfolio_media", ownerUserId: ownerId, deferProcessing: true });
    expect(row.variants).toEqual({});
    expect(row.metadata).toMatchObject({ processing: "pending" });
    const tasks = await db.execute<{ type: string }>(sql`select type from background_jobs where dedupe_key = ${`files.process:${row.id}`}`);
    expect(tasks.rows).toEqual([{ type: "files.process" }]);

    expect(await service.processStoredFile(row.id)).toBe("processed");
    const [updated] = await db.select().from(files).where(eq(files.id, row.id));
    expect(Object.keys(updated!.variants).sort()).toEqual(["md", "thumb"]);
    expect(updated!.metadata).toMatchObject({ processing: "complete" });
  });

  it("soft-deletes, schedules the purge and removes the bytes when purged", async () => {
    const img = await sharp({ create: { width: 500, height: 500, channels: 3, background: "#654321" } }).jpeg().toBuffer();
    const row = await service.storeFile({ data: img, originalName: "old.jpg", purpose: "avatar", ownerUserId: ownerId });
    expect(await service.softDeleteFile(row.id, { actorUserId: ownerId, reason: "test" })).toBe(true);
    expect(await service.softDeleteFile(row.id, { actorUserId: ownerId })).toBe(false);
    expect(await service.getFile(row.id)).toBeNull();
    const [task] = (await db.execute<{ run_at: Date }>(sql`select run_at from background_jobs where dedupe_key = ${`files.purge:${row.id}`}`)).rows;
    expect(new Date(task!.run_at).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);

    expect(await service.purgeDeletedFile(row.id)).toBe("not_due");
    expect(await service.purgeDeletedFile(row.id, { force: true })).toBe("purged");
    expect(await onDisk(row.storageKey)).toBeNull();
    expect(await onDisk(row.variants.thumb!.key)).toBeNull();
    expect(await service.purgeDeletedFile(row.id, { force: true })).toBe("already_purged");
  });
});
