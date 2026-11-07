/**
 * HTTP behaviour of the platform route handlers, called directly with Request objects.
 * Only the session layer is mocked (there is no Next.js request scope in Vitest); storage, the
 * database, access rules, audit and data-access logging are real. Runs only against an isolated
 * test database (DATABASE_URL containing "vsg_test_").
 */
import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "infra", "storage-routes-test"));
const CRON_SECRET = "test-cron-secret-0123456789abcdef";

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; isStaff: boolean },
  staffPermissions: new Set<string>(),
}));

vi.mock("@/modules/identity/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/identity/session")>();
  const sessionUser = () =>
    auth.user
      ? {
          id: auth.user.id,
          email: null,
          phone: null,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: null,
          displayName: "Test user",
          avatarFileId: null,
          status: "active" as const,
          isStaff: auth.user.isStaff,
          locale: "en",
          timezone: null,
          hasPassword: true,
          twoFactorEnabled: true,
        }
      : null;
  return {
    ...actual,
    getCurrentUser: async () => sessionUser(),
    getCurrentSession: async () => {
      const user = sessionUser();
      return user ? { user, needsTwoFactor: false, session: { id: "test", expiresAt: new Date(Date.now() + 3600_000), twoFactorVerifiedAt: new Date(), activeOrgs: {}, createdAt: new Date() } } : null;
    },
  };
});

vi.mock("@/modules/identity/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/identity/authz")>();
  return {
    ...actual,
    getStaffContext: async () => (auth.user?.isStaff ? { user: { id: auth.user.id }, roleKeys: [], permissions: auth.staffPermissions, isSuperAdmin: false } : null),
  };
});

describe.skipIf(!enabled)("platform route handlers", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "", CRON_SECRET });

  const { and, eq, isNull, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { dataAccessLogs, files, organizationMembers, organizations, roles, users } = await import("@/db/schema");
  const createdOrgIds: string[] = [];
  const { storeFile } = await import("./service");
  const uploadRoute = await import("@/app/api/v1/uploads/route");
  const fileRoute = await import("@/app/api/v1/files/[id]/route");
  const mediaRoute = await import("@/app/media/[id]/[name]/route");
  const healthRoute = await import("@/app/api/v1/health/route");
  const cronRoute = await import("@/app/api/v1/cron/tick/route");

  const stamp = Date.now();
  const [owner] = await db.insert(users).values({ displayName: "Route owner", email: `route-owner-${stamp}@vsg-test.invalid` }).returning({ id: users.id });
  const [stranger] = await db.insert(users).values({ displayName: "Route stranger", email: `route-stranger-${stamp}@vsg-test.invalid` }).returning({ id: users.id });
  const [staffer] = await db.insert(users).values({ displayName: "Route staff", email: `route-staff-${stamp}@vsg-test.invalid`, isStaff: true }).returning({ id: users.id });
  const userIds = [owner!.id, stranger!.id, staffer!.id];

  afterAll(async () => {
    await db.execute(sql`delete from data_access_logs where actor_user_id in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
    await db.execute(sql`delete from files where owner_user_id in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
    await db.execute(sql`delete from rate_limit_buckets where key like 'upload:%'`);
    for (const orgId of createdOrgIds) await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.execute(sql`delete from users where id in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
    await pool.end();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    auth.user = null;
    auth.staffPermissions = new Set();
  });

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
  const resume = await storeFile({ data: pdf, originalName: "Owner CV.pdf", purpose: "resume", ownerUserId: owner!.id });
  const logo = await storeFile({
    data: await sharp({ create: { width: 600, height: 300, channels: 3, background: "#16a6a1" } }).png().toBuffer(),
    originalName: "Logo.png",
    purpose: "org_logo",
    ownerUserId: owner!.id,
  });

  describe("GET /media/[id]/[name]", () => {
    it("serves public files with immutable caching and safe headers", async () => {
      const res = await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${logo.id}/logo.png`), params({ id: logo.id, name: "logo.png" }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      expect(res.headers.get("content-disposition")).toMatch(/^inline; filename="logo\.png"/);
      expect(Buffer.from(await res.arrayBuffer()).byteLength).toBe(logo.sizeBytes);
    });

    it("serves WebP variants and forces downloads on request", async () => {
      const thumb = await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${logo.id}/logo.webp?variant=thumb`), params({ id: logo.id, name: "logo.webp" }));
      expect(thumb.headers.get("content-type")).toBe("image/webp");
      expect((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width).toBe(320);
      const dl = await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${logo.id}/logo.png?download=1`), params({ id: logo.id, name: "logo.png" }));
      expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
      await dl.body?.cancel();
    });

    it("answers 304 to a matching If-None-Match", async () => {
      const first = await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${logo.id}/logo.png`), params({ id: logo.id, name: "logo.png" }));
      const etag = first.headers.get("etag")!;
      await first.body?.cancel();
      const again = await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${logo.id}/logo.png`, { headers: { "if-none-match": etag } }), params({ id: logo.id, name: "logo.png" }));
      expect(again.status).toBe(304);
    });

    it("never reveals private, unknown or quarantined files", async () => {
      expect((await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${resume.id}/cv.pdf`), params({ id: resume.id, name: "cv.pdf" }))).status).toBe(404);
      expect((await mediaRoute.GET(new NextRequest("http://localhost:3000/media/x/y"), params({ id: "not-a-uuid", name: "y" }))).status).toBe(404);
      await db.update(files).set({ scanStatus: "infected" }).where(eq(files.id, logo.id));
      expect((await mediaRoute.GET(new NextRequest(`http://localhost:3000/media/${logo.id}/logo.png`), params({ id: logo.id, name: "logo.png" }))).status).toBe(404);
      await db.update(files).set({ scanStatus: "not_scanned" }).where(eq(files.id, logo.id));
    });
  });

  describe("GET /api/v1/files/[id]", () => {
    const get = (id: string, init?: ConstructorParameters<typeof NextRequest>[1], query = "") => fileRoute.GET(new NextRequest(`http://localhost:3000/api/v1/files/${id}${query}`, init), params({ id }));

    it("asks signed-out visitors to sign in (redirect for page navigations)", async () => {
      expect((await get(resume.id)).status).toBe(401);
      const nav = await get(resume.id, { headers: { "sec-fetch-dest": "document" } });
      expect(nav.status).toBe(303);
      expect(nav.headers.get("location")).toBe(`http://localhost:3000/sign-in?returnTo=${encodeURIComponent(`/api/v1/files/${resume.id}`)}`);
    });

    it("serves the owner's sensitive file without caching", async () => {
      auth.user = { id: owner!.id, isStaff: false };
      const res = await get(resume.id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("etag")).toBeNull();
      expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''Owner%20CV.pdf");
      expect(Buffer.from(await res.arrayBuffer()).equals(pdf)).toBe(true);
    });

    it("forbids other users and staff without the purpose permission", async () => {
      auth.user = { id: stranger!.id, isStaff: false };
      expect((await get(resume.id)).status).toBe(403);
      auth.user = { id: staffer!.id, isStaff: true };
      auth.staffPermissions = new Set(["candidates.view"]);
      expect((await get(resume.id)).status).toBe(403);
    });

    it("lets permitted staff read and records the access", async () => {
      auth.user = { id: staffer!.id, isStaff: true };
      auth.staffPermissions = new Set(["candidates.view_documents"]);
      const res = await get(resume.id, undefined, "?download=1");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
      await res.body?.cancel();
      const logs = await db.select().from(dataAccessLogs).where(eq(dataAccessLogs.subjectId, resume.id));
      expect(logs.at(-1)).toMatchObject({ actorUserId: staffer!.id, subjectUserId: owner!.id, subjectType: "file", accessType: "download", dataCategory: "documents" });
    });

    it("holds back files still being scanned (409) except for their owner", async () => {
      await db.update(files).set({ scanStatus: "pending" }).where(eq(files.id, resume.id));
      auth.user = { id: staffer!.id, isStaff: true };
      auth.staffPermissions = new Set(["candidates.view_documents"]);
      expect((await get(resume.id)).status).toBe(409);
      auth.user = { id: owner!.id, isStaff: false };
      const own = await get(resume.id);
      expect(own.status).toBe(200);
      await own.body?.cancel();
      await db.update(files).set({ scanStatus: "not_scanned" }).where(eq(files.id, resume.id));
    });

    it("returns 404 for unknown ids", async () => {
      expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
      expect((await get("../../etc/passwd")).status).toBe(404);
    });
  });

  describe("POST /api/v1/uploads", () => {
    const post = (form: FormData, headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000" }, query = "") =>
      uploadRoute.POST(new NextRequest(`http://localhost:3000/api/v1/uploads${query}`, { method: "POST", body: form, headers }));
    const formFor = (purpose: string, file: Blob, fileName: string, extra: Record<string, string> = {}) => {
      const form = new FormData();
      form.append("purpose", purpose);
      for (const [k, v] of Object.entries(extra)) form.append(k, v);
      form.append("file", file, fileName);
      return form;
    };

    it("rejects cross-site and signed-out uploads", async () => {
      auth.user = { id: owner!.id, isStaff: false };
      expect((await post(formFor("resume", new Blob([pdf], { type: "application/pdf" }), "cv.pdf"), { host: "localhost:3000" })).status).toBe(403);
      expect((await post(formFor("resume", new Blob([pdf], { type: "application/pdf" }), "cv.pdf"), { origin: "https://evil.example", host: "localhost:3000" })).status).toBe(403);
      auth.user = null;
      expect((await post(formFor("resume", new Blob([pdf], { type: "application/pdf" }), "cv.pdf"))).status).toBe(401);
    });

    it("stores a candidate upload and returns the file description", async () => {
      auth.user = { id: owner!.id, isStaff: false };
      const res = await post(formFor("resume", new Blob([pdf], { type: "application/pdf" }), "My CV.pdf"), undefined, "?purpose=resume");
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({ name: "My CV.pdf", size: pdf.byteLength, mimeType: "application/pdf", scanStatus: "not_scanned", visibility: "private", purpose: "resume", width: null, height: null });
      expect(body.url).toBe(`/api/v1/files/${body.id}`);
      const [row] = await db.select().from(files).where(eq(files.id, body.id));
      expect(row).toMatchObject({ ownerUserId: owner!.id, organizationId: null });
    });

    it("validates content and purpose authorisation", async () => {
      auth.user = { id: owner!.id, isStaff: false };
      const fakePdf = await post(formFor("resume", new Blob([Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)])], { type: "application/pdf" }), "cv.pdf"));
      expect(fakePdf.status).toBe(415);
      expect((await fakePdf.json()).code).toBe("dangerous");
      // CMS media needs staff with media.manage.
      expect((await post(formFor("cms_media", new Blob([pdf], { type: "application/pdf" }), "brochure.pdf"))).status).toBe(403);
      // Organisation files need an organisation the user belongs to.
      expect((await post(formFor("org_document", new Blob([pdf], { type: "application/pdf" }), "reg.pdf"))).status).toBe(400);
      expect((await post(formFor("org_document", new Blob([pdf], { type: "application/pdf" }), "reg.pdf", { organizationId: "00000000-0000-4000-8000-000000000000" }))).status).toBe(403);
      // Server-generated purposes cannot be uploaded.
      expect((await post(formFor("data_export", new Blob(['{"a":1}'], { type: "application/json" }), "x.json"))).status).toBe(400);
      // Public visibility only where the purpose allows it.
      expect((await post(formFor("resume", new Blob([pdf], { type: "application/pdf" }), "cv.pdf", { visibility: "public" }))).status).toBe(400);
    });

    it("lets staff with media.manage upload public CMS media", async () => {
      auth.user = { id: staffer!.id, isStaff: true };
      auth.staffPermissions = new Set(["media.manage"]);
      const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
      const res = await post(formFor("cms_media", new Blob([png], { type: "image/png" }), "hero.png"));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.visibility).toBe("public");
      expect(body.url).toBe(`/media/${body.id}/hero.png`);
      expect(body.thumbnailUrl).toBe(`/media/${body.id}/hero.webp?variant=thumb`);
    });

    it("lets organisation members upload for their organisation, and scopes reads to members", async () => {
      // Do not depend on another test file having seeded the role templates.
      const { seedRoles } = await import("@/server/seed/roles");
      await seedRoles();
      const [role] = await db.select({ id: roles.id }).from(roles).where(and(eq(roles.scope, "employer"), eq(roles.key, "owner"), isNull(roles.organizationId)));
      if (!role) throw new Error("Seed the test database first (employer owner role missing)");
      const [org] = await db.insert(organizations).values({ type: "employer", name: "Route test employer", slug: `route-test-employer-${stamp}` }).returning({ id: organizations.id });
      createdOrgIds.push(org!.id);
      await db.insert(organizationMembers).values({ organizationId: org!.id, userId: stranger!.id, roleId: role.id });

      auth.user = { id: stranger!.id, isStaff: false };
      const res = await post(formFor("org_document", new Blob([pdf], { type: "application/pdf" }), "registration.pdf", { organizationId: org!.id }));
      expect(res.status).toBe(201);
      const body = await res.json();
      const [row] = await db.select().from(files).where(eq(files.id, body.id));
      expect(row).toMatchObject({ organizationId: org!.id, ownerUserId: stranger!.id, purpose: "org_document" });

      // The uploader's colleague would be allowed via membership; a non-member is not.
      await db.update(files).set({ ownerUserId: owner!.id }).where(eq(files.id, body.id));
      const asMember = await fileRoute.GET(new NextRequest(`http://localhost:3000/api/v1/files/${body.id}`), params({ id: body.id }));
      expect(asMember.status).toBe(200);
      await asMember.body?.cancel();
      auth.user = { id: staffer!.id, isStaff: false };
      expect((await fileRoute.GET(new NextRequest(`http://localhost:3000/api/v1/files/${body.id}`), params({ id: body.id }))).status).toBe(403);
    });

    it("stops reading bodies larger than the purpose limit", async () => {
      auth.user = { id: owner!.id, isStaff: false };
      const big = new Blob([Buffer.alloc(6 * 1024 * 1024, 1)], { type: "image/jpeg" });
      const res = await post(formFor("avatar", big, "huge.jpg"), undefined, "?purpose=avatar");
      expect(res.status).toBe(413);
      expect((await res.json()).code).toBe("too_large");
    });
  });

  describe("GET /api/v1/health", () => {
    it("reports the database status and version without secrets", async () => {
      const res = await healthRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ status: "ok", checks: { database: { status: "ok" } } });
      expect(typeof body.version).toBe("string");
      expect(JSON.stringify(body)).not.toMatch(/postgres:|password|secret/i);
    });
  });

  describe("GET|POST /api/v1/cron/tick", () => {
    it("requires the bearer secret", async () => {
      expect((await cronRoute.GET(new Request("http://localhost:3000/api/v1/cron/tick"))).status).toBe(401);
      expect((await cronRoute.GET(new Request("http://localhost:3000/api/v1/cron/tick", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    });

    it("schedules recurring tasks and processes due work", async () => {
      const res = await cronRoute.POST(new Request("http://localhost:3000/api/v1/cron/tick", { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.processed).toMatchObject({ claimed: expect.any(Number), succeeded: expect.any(Number) });
      expect(Array.isArray(body.scheduled.enqueued)).toBe(true);
      expect(body.durationMs).toBeLessThan(50_000);
    }, 60_000);
  });
});
