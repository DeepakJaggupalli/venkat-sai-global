/**
 * Integration tests for the content module against an ISOLATED database:
 *   node scripts/test-db.mjs vsg_test_content
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_content'; npx vitest run src/modules/content
 * Content tables are emptied at the start, so the suite can be re-run on the same database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

describe.skipIf(!enabled)("content module (PostgreSQL)", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }

  const { and, count, eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const s = await import("@/db/schema");
  const service = await import("./service");
  const queries = await import("./queries");
  const { seedContent } = await import("./seed");
  const { processScheduledEntries } = await import("./scheduled");
  const { processAnnouncementSchedule } = await import("./announcements");
  const { decideApproval } = await import("@/modules/approvals/service");
  type StaffContext = import("@/modules/identity/authz").StaffContext;
  type OrgContext = import("@/modules/identity/authz").OrgContext<"employer">;

  const ALL = [
    "content.view",
    "content.edit",
    "content.publish",
    "media.manage",
    "announcements.manage",
    "metrics.public_manage",
    "approvals.view",
    "approvals.decide",
  ];

  async function makeUser(staff: boolean) {
    const [u] = await db
      .insert(s.users)
      .values({ displayName: staff ? "Content Staff" : "Employer Member", email: `c-${randomUUID()}@vsg-test.invalid`, emailVerifiedAt: new Date(), isStaff: staff })
      .returning();
    return u!;
  }

  function staffCtx(user: typeof s.users.$inferSelect, permissions: string[]): StaffContext {
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: null,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: null,
        displayName: user.displayName,
        avatarFileId: null,
        status: "active",
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: true,
        twoFactorEnabled: true,
      },
      roleKeys: ["content_manager"],
      permissions: new Set(permissions),
      isSuperAdmin: false,
    };
  }

  let admin: StaffContext;
  let editor: StaffContext;
  let staffUserId: string;

  async function makeFile(opts: { mime?: string } = {}) {
    const id = randomUUID();
    const [file] = await db
      .insert(s.files)
      .values({
        id,
        storageDriver: "local",
        storageKey: `2026/11/${id}`,
        originalName: opts.mime === "application/pdf" ? "release.pdf" : "photo.jpg",
        mimeType: opts.mime ?? "image/jpeg",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
        purpose: "cms_media",
        ownerUserId: staffUserId,
        scanStatus: "clean",
      })
      .returning();
    return file!;
  }

  const serviceData = (overview = "<p>Recruitment for employers abroad.</p>") => ({ overview, enquiryType: "employer" });

  async function createService(slug: string, title = "Test service") {
    return service.createEntry(admin, { collection: "services", locale: "en", title, slug, data: serviceData(), seo: {}, tags: [] });
  }

  async function entryRow(id: string) {
    const [row] = await db.select().from(s.cmsEntries).where(eq(s.cmsEntries.id, id));
    return row!;
  }

  beforeAll(async () => {
    await db.execute(sql`truncate cms_entry_versions, media_usages, cms_entries, logo_permissions, media_assets, media_folders, announcements, public_metrics cascade`);
    const user = await makeUser(true);
    staffUserId = user.id;
    admin = staffCtx(user, ALL);
    editor = staffCtx(user, ["content.view", "content.edit"]);
  });

  afterAll(async () => {
    await pool.end();
  });

  // -------------------------------------------------------------------------
  describe("seed", () => {
    it("creates the default content once and never overwrites admin edits", async () => {
      const first = await seedContent();
      expect(first.entriesCreated).toBeGreaterThan(60);
      expect(first.metricsCreated).toBe(11);

      const publishedServices = await db
        .select({ value: count() })
        .from(s.cmsEntries)
        .where(and(eq(s.cmsEntries.collection, "services"), eq(s.cmsEntries.status, "published")));
      // 11 services plus 10 training course families (tagged training-course).
      expect(publishedServices[0]!.value).toBe(21);
      const industryDrafts = await db
        .select({ value: count() })
        .from(s.cmsEntries)
        .where(and(eq(s.cmsEntries.collection, "industries"), eq(s.cmsEntries.status, "draft")));
      expect(industryDrafts[0]!.value).toBe(20);

      // Admin edits the homepage, then the seed runs again: nothing changes.
      const home = await queries.getSingletonForEditing(admin, "homepage");
      await service.updateEntry(admin, {
        id: home!.entry.id,
        title: "Homepage",
        data: { ...home!.latest.data, hero: { heading: "Edited by an administrator" } },
        seo: {},
        tags: [],
      });
      const second = await seedContent();
      expect(second.entriesCreated).toBe(0);
      expect(second.metricsCreated).toBe(0);
      const after = await queries.getSingletonForEditing(admin, "homepage");
      expect((after!.latest.data.hero as { heading: string }).heading).toBe("Edited by an administrator");
    });

    it("publishes the About page with facts only and keeps the proposed values as a draft version", async () => {
      const about = await queries.getSingleton("about");
      expect(about?.entry.data.history).toContain("Autonagar, Gajuwaka, Visakhapatnam");
      expect(about?.entry.data.mission).toBeUndefined();
      const detail = await queries.getSingletonForEditing(admin, "about");
      expect(detail?.entry.publishedVersion).toBe(1);
      expect(detail?.entry.currentVersion).toBe(2);
      expect(detail?.hasUnpublishedChanges).toBe(true);
      expect(detail?.latest.data.mission).toBeTruthy();
    });

    it("serves legal pages publicly without their internal notes, and site settings with no invented contact details", async () => {
      const privacy = await queries.getPublishedEntryBySlug("pages", "privacy-policy");
      expect(privacy?.entry.data.version).toBe("2026-11-01");
      expect(privacy?.entry.path).toBe("/legal/privacy-policy");
      expect(privacy?.entry.data).not.toHaveProperty("internalNote");
      const settings = await queries.getSingletonData("site_settings");
      expect(settings?.legalEntity.name).toBe("Venkat Sai Welding Works and Testing Center");
      // Contact details are the business's own (supplied by the owner), never invented placeholders.
      expect(settings?.contact).toMatchObject({ phone: "+919494263388", email: "vsweld@gmail.com", whatsappNumber: "+919494263388" });
      expect(await queries.getPublicMetrics()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe("versions and publication", () => {
    it("never changes the live page until a new version is published, and rolls back by creating a version", async () => {
      const { id } = await createService("test-versioning", "Version one");
      expect(await queries.getPublishedEntryBySlug("services", "test-versioning")).toBeNull();

      expect(await service.publishEntry(admin, { id })).toEqual({ outcome: "published", version: 1 });
      expect((await queries.getPublishedEntryBySlug("services", "test-versioning"))?.entry.title).toBe("Version one");

      const saved = await service.updateEntry(admin, { id, expectedVersion: 1, title: "Version two", data: serviceData("<p>Changed</p>"), seo: {}, tags: [] });
      expect(saved).toEqual({ version: 2, changed: true });
      const live = await queries.getPublishedEntryBySlug("services", "test-versioning");
      expect(live?.entry.title).toBe("Version one");
      expect(live?.entry.data.overview).toBe("<p>Recruitment for employers abroad.</p>");
      const detail = await queries.getEntryDetail(admin, id);
      expect(detail).toMatchObject({ hasUnpublishedChanges: true, latest: { version: 2, title: "Version two" } });

      // Identical save: no new version. Stale editor: refused.
      expect(await service.updateEntry(admin, { id, title: "Version two", data: serviceData("<p>Changed</p>"), seo: {}, tags: [] })).toEqual({ version: 2, changed: false });
      await expect(service.updateEntry(admin, { id, expectedVersion: 1, title: "Stale", data: serviceData(), seo: {}, tags: [] })).rejects.toThrow(/newer version/);

      await service.publishEntry(admin, { id });
      expect((await queries.getPublishedEntryBySlug("services", "test-versioning"))?.entry.title).toBe("Version two");

      const rollback = await service.rollbackEntry(admin, { id, version: 1, publish: true });
      expect(rollback).toEqual({ version: 3, outcome: { outcome: "published", version: 3 } });
      expect((await queries.getPublishedEntryBySlug("services", "test-versioning"))?.entry.title).toBe("Version one");
      const diff = await queries.compareEntryVersions(admin, id, 1, 3);
      expect(diff?.changes).toEqual([]);
      const versions = (await queries.getEntryDetail(admin, id))!.versions;
      expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
      expect(versions[0]!.note).toBe("Restored version 1");
    });

    it("sanitises rich text on save", async () => {
      const { id } = await service.createEntry(admin, {
        collection: "services",
        locale: "en",
        title: "Sanitised",
        data: { overview: '<p onclick="steal()">Hi<script>alert(1)</script></p>', enquiryType: "general" },
        seo: {},
        tags: [],
      });
      const detail = await queries.getEntryDetail(admin, id);
      expect(detail?.latest.data.overview).toBe("<p>Hi</p>");
    });

    it("moves a live entry to a new slug only when the change is published", async () => {
      const { id } = await createService("test-old-slug");
      await service.publishEntry(admin, { id });
      await service.updateEntry(admin, { id, title: "Test service", slug: "test-new-slug", data: serviceData(), seo: {}, tags: [] });
      expect(await queries.getPublishedEntryBySlug("services", "test-old-slug")).not.toBeNull();
      expect(await queries.getPublishedEntryBySlug("services", "test-new-slug")).toBeNull();
      await service.publishEntry(admin, { id });
      expect(await queries.getPublishedEntryBySlug("services", "test-old-slug")).toBeNull();
      expect((await queries.getPublishedEntryBySlug("services", "test-new-slug"))?.entry.id).toBe(id);
    });

    it("takes entries offline, deletes them to the bin and frees the slug for reuse", async () => {
      const { id } = await createService("test-bin");
      await service.publishEntry(admin, { id });
      await service.unpublishEntry(admin, id, "Outdated");
      expect(await queries.getPublishedEntryBySlug("services", "test-bin")).toBeNull();
      expect((await entryRow(id)).publishedVersion).toBeNull();
      await service.softDeleteEntry(admin, id, "Replaced");
      const replacement = await createService("test-bin", "Replacement");
      expect(replacement.slug).toBe("test-bin");
      expect((await entryRow(id)).slug).toMatch(/^test-bin-deleted-/);
      await service.restoreEntry(admin, id);
      expect((await entryRow(id))).toMatchObject({ status: "draft", deletedAt: null });
    });

    it("duplicates entries as drafts and enforces permissions", async () => {
      const { id } = await createService("test-duplicate");
      const copy = await service.duplicateEntry(admin, { id });
      expect(copy.slug).toBe("test-duplicate-copy");
      expect((await entryRow(copy.id)).status).toBe("draft");
      await expect(service.publishEntry(editor, { id })).rejects.toThrow(/permission/);
      const requested = await service.requestPublication(editor, { id });
      expect(requested.outcome).toBe("submitted_for_approval");
    });
  });

  // -------------------------------------------------------------------------
  describe("consent-sensitive content", () => {
    it("publishes a testimonial only with recorded consent and after approval", async () => {
      const { id } = await service.createEntry(admin, {
        collection: "testimonials",
        locale: "en",
        title: "Testimonial from a trainee",
        data: { quote: "The practical sessions helped me.", personName: "A. Trainee", type: "trainee" },
        seo: {},
        tags: [],
      });
      await expect(service.publishEntry(admin, { id })).rejects.toThrow(/consent/i);
      await service.updateEntryConsent(admin, { id, consentStatus: "obtained", consentNotes: "Signed form in the office file", consentObtainedAt: "2026-10-01" });
      const outcome = await service.publishEntry(admin, { id });
      expect(outcome.outcome).toBe("submitted_for_approval");
      expect((await queries.getPublishedEntries("testimonials")).items).toHaveLength(0);

      if (outcome.outcome !== "submitted_for_approval") throw new Error("expected approval");
      await decideApproval({ requestId: outcome.approvalId, decision: "approved", ctx: admin });
      const listed = await queries.getPublishedEntries("testimonials");
      expect(listed.items.map((e) => e.id)).toEqual([id]);
      expect(listed.items[0]!.data).not.toHaveProperty("collectedVia");

      const withdrawn = await service.updateEntryConsent(admin, { id, consentStatus: "withdrawn", consentNotes: "Asked to be removed" });
      expect(withdrawn).toEqual({ status: "archived", takenOffline: true });
      expect((await queries.getPublishedEntries("testimonials")).items).toHaveLength(0);
    });

    it("refuses to publish consent-required content at the database level as well", async () => {
      const { id } = await service.createEntry(admin, {
        collection: "team_members",
        locale: "en",
        title: "A Person",
        data: { role: "Manager", group: "team" },
        seo: {},
        tags: [],
      });
      await expect(db.update(s.cmsEntries).set({ status: "published", publishedVersion: 1, publishedAt: new Date() }).where(eq(s.cmsEntries.id, id))).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe("scheduling", () => {
    it("publishes a pinned version at publishAt and archives at unpublishAt", async () => {
      const { id } = await createService("test-schedule");
      const t0 = new Date();
      const publishAt = new Date(t0.getTime() + 3600_000);
      const scheduled = await service.scheduleEntry(admin, { id, publishAt });
      expect(scheduled).toMatchObject({ status: "scheduled", scheduledVersion: 1 });
      expect(await queries.getPublishedEntryBySlug("services", "test-schedule")).toBeNull();

      // Edits after scheduling are not published by the schedule.
      await service.updateEntry(admin, { id, title: "Edited after scheduling", data: serviceData(), seo: {}, tags: [] });
      const run = await processScheduledEntries(new Date(publishAt.getTime() + 60_000));
      expect(run.published).toBeGreaterThanOrEqual(1);
      const live = await queries.getPublishedEntryBySlug("services", "test-schedule", { now: new Date(publishAt.getTime() + 60_000) });
      expect(live?.entry.title).toBe("Test service");
      const row = await entryRow(id);
      expect(row).toMatchObject({ status: "published", publishedVersion: 1, currentVersion: 2, scheduledVersion: null, publishAt: null });

      await service.scheduleEntry(admin, { id, unpublishAt: new Date(Date.now() + 3600_000) });
      await processScheduledEntries(new Date(Date.now() + 2 * 3600_000));
      expect((await entryRow(id)).status).toBe("archived");
    });

    it("keeps the live version while a scheduled update waits", async () => {
      const { id } = await createService("test-scheduled-update", "Live title");
      await service.publishEntry(admin, { id });
      await service.updateEntry(admin, { id, title: "Scheduled title", data: serviceData(), seo: {}, tags: [] });
      const at = new Date(Date.now() + 3600_000);
      expect(await service.scheduleEntry(admin, { id, publishAt: at })).toMatchObject({ status: "published", scheduledVersion: 2 });
      expect((await queries.getPublishedEntryBySlug("services", "test-scheduled-update"))?.entry.title).toBe("Live title");
      await processScheduledEntries(new Date(at.getTime() + 1000));
      expect((await queries.getPublishedEntryBySlug("services", "test-scheduled-update"))?.entry.title).toBe("Scheduled title");
    });

    it("clears a schedule that can no longer be published and leaves the entry as a draft", async () => {
      const { id } = await createService("test-schedule-fails");
      const at = new Date(Date.now() + 3600_000);
      await service.scheduleEntry(admin, { id, publishAt: at });
      // Simulate content that no longer passes publication rules (e.g. a schema change).
      await db.update(s.cmsEntryVersions).set({ data: { enquiryType: "employer" } }).where(eq(s.cmsEntryVersions.entryId, id));
      const run = await processScheduledEntries(new Date(at.getTime() + 1000));
      expect(run.failed).toBeGreaterThanOrEqual(1);
      expect(await entryRow(id)).toMatchObject({ status: "draft", scheduledVersion: null, publishAt: null });
    });

    it("archives consent-required entries whose consent expires", async () => {
      const { id } = await service.createEntry(admin, {
        collection: "team_members",
        locale: "en",
        title: "Expiring Consent",
        data: { role: "Trainer", group: "team" },
        seo: {},
        tags: [],
      });
      await service.updateEntryConsent(admin, { id, consentStatus: "obtained", consentNotes: "Signed form", consentObtainedAt: "2026-01-01", consentExpiresAt: "2099-01-01" });
      await service.publishEntry(admin, { id });
      const expiry = new Date(Date.now() + 60_000);
      await db.update(s.cmsEntries).set({ consentExpiresAt: expiry }).where(eq(s.cmsEntries.id, id));
      expect((await queries.getPublishedEntries("team_members", { now: new Date(expiry.getTime() + 1000) })).items.map((e) => e.id)).not.toContain(id);
      const run = await processScheduledEntries(new Date(expiry.getTime() + 1000));
      expect(run.consentExpired).toBeGreaterThanOrEqual(1);
      expect((await entryRow(id)).status).toBe("archived");
    });
  });

  // -------------------------------------------------------------------------
  describe("public metrics", () => {
    it("shows live counts only when enabled, and never an unapproved manual figure", async () => {
      expect(await queries.getPublicMetrics()).toEqual([]);
      await service.updatePublicMetric(admin, { key: "jobs_facilitated", label: "Jobs facilitated", definition: "Job listings published on the platform.", mode: "live", isVisible: true, sortOrder: 10 });
      const [{ value: jobCount }] = await db.select({ value: count() }).from(s.jobs).where(sql`${s.jobs.publishedAt} is not null and ${s.jobs.deletedAt} is null`);
      expect(await queries.getPublicMetrics()).toEqual([expect.objectContaining({ key: "jobs_facilitated", value: jobCount, mode: "live" })]);

      await service.createCustomMetric(admin, { key: "custom_welders_trained", label: "Welders trained", definition: "Trainees who completed a welding course." });
      await service.setManualMetricValue(admin, { key: "custom_welders_trained", manualValue: 500, asOfDate: "2026-10-31", evidenceNote: "Batch registers" });
      await expect(
        service.updatePublicMetric(admin, { key: "custom_welders_trained", label: "Welders trained", definition: "Trainees who completed a welding course.", mode: "manual", isVisible: true, sortOrder: 20 }),
      ).rejects.toThrow(/approved/);
      // The database refuses too.
      await expect(db.update(s.publicMetrics).set({ mode: "manual", isVisible: true }).where(sql`${s.publicMetrics.key} = 'custom_welders_trained'`)).rejects.toThrow();
      expect((await queries.getPublicMetrics()).map((m) => m.key)).toEqual(["jobs_facilitated"]);

      await service.approveManualMetricValue(admin, "custom_welders_trained");
      await service.updatePublicMetric(admin, { key: "custom_welders_trained", label: "Welders trained", definition: "Trainees who completed a welding course.", mode: "manual", isVisible: true, sortOrder: 20 });
      expect(await queries.getPublicMetrics()).toContainEqual(expect.objectContaining({ key: "custom_welders_trained", value: 500, asOf: "2026-10-31", mode: "manual" }));

      // Editing the figure hides it until it is approved again.
      const edited = await service.setManualMetricValue(admin, { key: "custom_welders_trained", manualValue: 900, asOfDate: "2026-11-05", evidenceNote: "Batch registers" });
      expect(edited).toEqual({ needsApproval: true, hidden: true });
      expect((await queries.getPublicMetrics()).map((m) => m.key)).toEqual(["jobs_facilitated"]);
    });
  });

  // -------------------------------------------------------------------------
  describe("preview tokens", () => {
    it("renders drafts only for a valid token of that entry", async () => {
      const { id } = await createService("test-preview", "Draft title");
      const other = await createService("test-preview-other");
      const link = await service.createPreviewLink(admin, { id });
      expect(link.url).toMatch(/^\/services\/test-preview\?preview=/);
      expect(await queries.getPublishedEntryBySlug("services", "test-preview")).toBeNull();
      const preview = await queries.getPublishedEntryBySlug("services", "test-preview", { preview: link.token });
      expect(preview).toMatchObject({ preview: true, entry: { title: "Draft title", seo: { noindex: true } } });
      expect(await queries.getPublishedEntryBySlug("services", "test-preview-other", { preview: link.token })).toBeNull();
      expect(await queries.getPublishedEntryBySlug("industries", "test-preview", { preview: link.token })).toBeNull();
      expect(await queries.getPublishedEntryBySlug("services", "test-preview", { preview: `${link.token}x` })).toBeNull();
      const otherLink = await service.createPreviewLink(admin, { id: other.id, version: 1 });
      expect(await queries.getPublishedEntryBySlug("services", "test-preview", { preview: otherLink.token })).toBeNull();
      expect(await queries.resolvePreviewTarget(link.token)).toMatchObject({ collection: "services", slug: "test-preview", path: "/services/test-preview" });
    });

    it("previews a pinned version or the latest changes of a live entry", async () => {
      const { id } = await createService("test-preview-live", "Live");
      await service.publishEntry(admin, { id });
      await service.updateEntry(admin, { id, title: "Pending", data: serviceData(), seo: {}, tags: [] });
      const latest = await service.createPreviewLink(admin, { id, version: "latest" });
      const pinned = await service.createPreviewLink(admin, { id, version: 1 });
      expect((await queries.getPublishedEntryBySlug("services", "test-preview-live", { preview: latest.token }))?.entry.title).toBe("Pending");
      expect((await queries.getPublishedEntryBySlug("services", "test-preview-live", { preview: pinned.token }))?.entry.title).toBe("Live");
      expect((await queries.getPublishedEntryBySlug("services", "test-preview-live"))?.entry.title).toBe("Live");
    });
  });

  // -------------------------------------------------------------------------
  describe("media library", () => {
    it("tracks usage, blocks deletion while used and resolves only public media", async () => {
      const file = await makeFile();
      const created = await service.createMediaAsset(admin, {
        fileId: file.id,
        title: "Workshop",
        altText: "Welding workshop bench",
        decorative: false,
        tags: ["workshop"],
        showsIdentifiablePeople: false,
        visibility: "public",
      });
      expect(created).toMatchObject({ visibility: "public", approval: null });
      const [storedFile] = await db.select().from(s.files).where(eq(s.files.id, file.id));
      expect(storedFile!.visibility).toBe("public");

      const { id } = await service.createEntry(admin, { collection: "services", locale: "en", title: "With hero", slug: "test-hero", data: serviceData(), seo: {}, tags: [], heroAssetId: created.id });
      await service.publishEntry(admin, { id });
      const page = await queries.getPublishedEntryBySlug("services", "test-hero");
      expect(page?.assets[created.id]).toMatchObject({ alt: "Welding workshop bench", kind: "image" });
      expect(page?.assets[created.id]?.url).toMatch(new RegExp(`^/media/${file.id}/`));
      await expect(service.archiveMediaAsset(admin, created.id)).rejects.toThrow(/still used/);
      await expect(service.deleteMediaAsset(admin, created.id)).rejects.toThrow(/still used/);
      expect((await queries.listAssetUsages(created.id)).map((u) => u.field)).toEqual(["heroAssetId"]);
    });

    it("needs consent and an approval before media showing people is public; withdrawal removes it at once", async () => {
      const file = await makeFile();
      const created = await service.createMediaAsset(admin, {
        fileId: file.id,
        title: "Trainees at work",
        altText: "Two trainees welding",
        decorative: false,
        tags: [],
        showsIdentifiablePeople: true,
        visibility: "public",
      });
      expect(created).toMatchObject({ visibility: "internal", needsConsent: true });
      await expect(service.setMediaVisibility(admin, created.id, "public")).rejects.toThrow(/consent/i);

      // Publishing an entry that uses an internal item is refused.
      const { id } = await service.createEntry(admin, { collection: "services", locale: "en", title: "People", slug: "test-people", data: serviceData(), seo: {}, tags: [], heroAssetId: created.id });
      await expect(service.publishEntry(admin, { id })).rejects.toThrow(/not public/);

      const release = await makeFile({ mime: "application/pdf" });
      await service.updateMediaConsent(admin, { id: created.id, consentStatus: "obtained", consentFileId: release.id, consentObtainedAt: "2026-10-15" });
      const [releaseRow] = await db.select().from(s.files).where(eq(s.files.id, release.id));
      expect(releaseRow!.visibility).toBe("private");
      const requested = await service.setMediaVisibility(admin, created.id, "public");
      expect(requested.approval).not.toBeNull();
      await decideApproval({ requestId: requested.approval!.id, decision: "approved", ctx: admin });
      expect(Object.keys(await queries.resolvePublicAssets([created.id]))).toEqual([created.id]);
      await service.publishEntry(admin, { id });

      const withdrawn = await service.updateMediaConsent(admin, { id: created.id, consentStatus: "withdrawn", consentNotes: "Withdrawn by email" });
      expect(withdrawn.withdrawnFromPublicUse).toBe(true);
      expect(withdrawn.affectedUsages.map((u) => u.entityId)).toContain(id);
      expect(await queries.resolvePublicAssets([created.id])).toEqual({});
      const [fileRow] = await db.select().from(s.files).where(eq(s.files.id, file.id));
      expect(fileRow!.visibility).toBe("private");
      expect((await queries.getPublishedEntryBySlug("services", "test-people"))?.assets).toEqual({});
    });

    it("deletes unused media and normalises video embeds", async () => {
      const embed = await service.createEmbedAsset(admin, { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Intro video", decorative: false, tags: [], showsIdentifiablePeople: false, visibility: "public" });
      const [row] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, embed.id));
      expect(row!.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      await service.deleteMediaAsset(admin, embed.id);
      expect((await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, embed.id)))[0]!.deletedAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("announcements", () => {
    it("schedules, shows and expires announcements by audience and placement", async () => {
      const startsAt = new Date(Date.now() + 3600_000);
      const endsAt = new Date(Date.now() + 2 * 3600_000);
      const { id } = await service.saveAnnouncement(admin, {
        title: "Hiring drive on Saturday",
        audience: ["public", "talent"],
        placements: ["homepage_banner", "notification_centre"],
        priority: "high",
        isDismissible: true,
        startsAt,
        endsAt,
      });
      expect(await service.publishAnnouncement(admin, id)).toEqual({ status: "scheduled" });
      expect(await queries.getActiveAnnouncements({ audience: "public", placement: "homepage_banner" })).toEqual([]);
      const mid = new Date(startsAt.getTime() + 60_000);
      await processAnnouncementSchedule(mid);
      const active = await queries.getActiveAnnouncements({ audience: "public", placement: "homepage_banner", now: mid });
      expect(active.map((a) => a.id)).toEqual([id]);
      expect(queries.toBannerAnnouncement(active[0]!)).toMatchObject({ tone: "highlight", dismissible: true });
      expect(await queries.getActiveAnnouncements({ audience: "employer", placement: "homepage_banner", now: mid })).toEqual([]);
      expect(await queries.getActiveAnnouncements({ audience: "public", placement: "ticker", now: mid })).toEqual([]);
      await processAnnouncementSchedule(new Date(endsAt.getTime() + 1000));
      const [row] = await db.select().from(s.announcements).where(eq(s.announcements.id, id));
      expect(row!.status).toBe("expired");
    });

    it("routes partner announcements through approval", async () => {
      const member = await makeUser(false);
      const [org] = await db.insert(s.organizations).values({ type: "employer", name: "Verified Employer", slug: `verified-${randomUUID().slice(0, 8)}`, status: "verified" }).returning();
      const ctx: OrgContext = {
        orgType: "employer",
        user: { ...admin.user, id: member.id, isStaff: false },
        sessionId: randomUUID(),
        organization: org!,
        membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
        role: { id: randomUUID(), key: "owner", name: "Owner" },
        permissions: new Set(["employer.company.manage"]),
        isOwner: true,
      };
      const request = await service.savePartnerAnnouncement(ctx, { title: "Walk-in interviews", audience: ["talent"], placements: ["notification_centre"], priority: "normal" });
      expect(await queries.getActiveAnnouncements({ audience: "talent", placement: "notification_centre" })).toEqual([]);
      const [approval] = await db.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.type, "partner_announcement"), eq(s.approvalRequests.entityId, request.id)));
      await decideApproval({ requestId: approval!.id, decision: "approved", ctx: admin });
      const active = await queries.getActiveAnnouncements({ audience: "talent", placement: "notification_centre" });
      expect(active.find((a) => a.id === request.id)).toMatchObject({ fromPartner: true });

      const unverified = { ...ctx, organization: { ...org!, status: "pending" as const } };
      await expect(service.savePartnerAnnouncement(unverified, { title: "Nope", audience: ["talent"], placements: ["ticker"], priority: "normal" })).rejects.toThrow(/verified/);
    });
  });

  // -------------------------------------------------------------------------
  describe("client logos and search", () => {
    it("shows a logo only where an approved permission allows it", async () => {
      const file = await makeFile();
      const logo = await service.createMediaAsset(admin, { fileId: file.id, title: "Client logo", altText: "Example Industries logo", decorative: false, tags: [], showsIdentifiablePeople: false, visibility: "public" });
      const permission = await service.saveLogoPermission(admin, {
        organizationName: "Example Industries",
        relationship: "client",
        logoAssetId: logo.id,
        permissionType: "email_approval",
        evidenceReference: "Email from the marketing head, 2026-10-02",
        grantedByName: "Marketing head",
        grantedAt: "2026-10-02",
        displayLocations: ["homepage"],
      });
      const { id } = await service.createEntry(admin, { collection: "client_logos", locale: "en", title: "Example Industries", data: { logoAssetId: logo.id }, seo: {}, tags: [] });
      await expect(service.publishEntry(admin, { id })).rejects.toThrow(/logo permission/i);
      await service.setEntryLogoPermission(admin, { id, logoPermissionId: permission.id });
      await expect(service.publishEntry(admin, { id })).rejects.toThrow(/not approved/);
      await service.approveLogoPermission(admin, permission.id);
      await service.publishEntry(admin, { id });

      const home = await queries.getPublishedEntries("client_logos", { logoLocation: "homepage" });
      expect(home.items.map((e) => e.logo)).toEqual([{ organizationName: "Example Industries", relationship: "client" }]);
      expect((await queries.getPublishedEntries("client_logos", { logoLocation: "clients_page" })).items).toHaveLength(0);
      await expect(queries.getPublishedEntries("client_logos")).rejects.toThrow(/logoLocation/);

      expect(await service.revokeLogoPermission(admin, { id: permission.id, reason: "Permission withdrawn" })).toEqual({ logosTakenOffline: 1 });
      expect((await queries.getPublishedEntries("client_logos", { logoLocation: "homepage" })).items).toHaveLength(0);
    });

    it("runs content.publish_scheduled: expires media consent and logo permissions", async () => {
      const { tasks } = await import("./tasks");
      const file = await makeFile();
      const asset = await service.createMediaAsset(admin, { fileId: file.id, title: "Time-limited", altText: "Banner", decorative: false, tags: [], showsIdentifiablePeople: false, visibility: "public" });
      await db.update(s.mediaAssets).set({ consentExpiresAt: new Date(Date.now() - 1000) }).where(eq(s.mediaAssets.id, asset.id));
      const permission = await service.saveLogoPermission(admin, {
        organizationName: "Expiring Permission Ltd",
        relationship: "partner",
        permissionType: "written_consent",
        evidenceReference: "Letter on file",
        grantedByName: "Director",
        grantedAt: "2026-01-01",
        expiresAt: "2099-01-01",
        displayLocations: ["partners_page"],
      });
      await service.approveLogoPermission(admin, permission.id);
      await db.update(s.logoPermissions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.logoPermissions.id, permission.id));

      const logs: string[] = [];
      await tasks["content.publish_scheduled"]!({}, { taskId: 1, attempt: 1, log: (message) => logs.push(message) });
      expect(logs).toContain("Content schedule processed");
      const [assetRow] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, asset.id));
      expect(assetRow!.visibility).toBe("internal");
      const [permissionRow] = await db.select().from(s.logoPermissions).where(eq(s.logoPermissions.id, permission.id));
      expect(permissionRow!.status).toBe("expired");
      const [jobs] = await db.select({ value: count() }).from(s.backgroundJobs).where(sql`${s.backgroundJobs.type} = 'notifications.dispatch_staff'`);
      expect(jobs!.value).toBeGreaterThan(0);
    });

    it("searches published content only", async () => {
      const { id } = await service.createEntry(admin, { collection: "services", locale: "en", title: "Pipefitting search test", data: serviceData("<p>Unique zygomorphic pipefitting service.</p>"), seo: {}, tags: [] });
      expect(await queries.searchContent("zygomorphic")).toEqual([]);
      await service.publishEntry(admin, { id });
      const results = await queries.searchContent("zygomorphic");
      expect(results.map((r) => r.title)).toEqual(["Pipefitting search test"]);
      expect(results[0]!.snippet).toContain("«zygomorphic»");
      expect(await queries.searchContent("x")).toEqual([]);
    });
  });
});
