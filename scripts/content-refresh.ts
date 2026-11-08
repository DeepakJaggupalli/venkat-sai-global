/**
 * Content refresh: bring seeded CMS entries up to date with the current seed text, without touching staff edits.
 *
 *   npm run content:refresh            (same environment as `npm run db:seed`: DATABASE_URL, SEED_ADMIN_EMAIL)
 *
 * The production seed is insert-only, so an existing database never picks up improved seed copy. This script
 * covers the entries listed in REFRESH_SPECS (site settings, the About page and every service, including the
 * training course families):
 *  - missing entry                → created (and published when the seed publishes it) through the content
 *                                   module's own services (createEntry / publishEntry);
 *  - entry still at seeded content → a new version with the current seed content is saved and published
 *                                   (updateEntry / publishEntry);
 *  - entry already identical       → left alone ("up to date");
 *  - anything else                 → skipped and reported: someone edited, re-published, scheduled, unpublished
 *                                   or binned it, and their work always wins.
 *
 * "Still at seeded content" means every version was written by the seed (versions 1..n, no author) or by an
 * earlier run of this script (note prefix below), the live version is the one the seed or this script made live,
 * and nothing is scheduled. Service order and the featured flag (the three main services) are applied only while
 * staff have not changed them. Idempotent: a second run reports everything as up to date.
 *
 * Actions are recorded in the audit log as the Super Admin named by SEED_ADMIN_EMAIL (or CONTENT_REFRESH_EMAIL),
 * falling back to the first Super Admin.
 */
import Module from "node:module";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/** Same alias as scripts/seed.ts: the react-server build of next/navigation for server-only modules. */
function aliasReactServerNavigation(): void {
  const target = require.resolve("next/dist/client/components/navigation.react-server.js");
  const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = loader._resolveFilename;
  loader._resolveFilename = function resolve(this: unknown, request: string, ...rest: unknown[]): string {
    if (request === "next/navigation" || request === "next/navigation.js") return target;
    return original.call(this, request, ...rest);
  };
}
aliasReactServerNavigation();

const REFRESH_NOTE = "Content refresh";
const LIVE_NOTE = `${REFRESH_NOTE} (live):`;
const DRAFT_NOTE = `${REFRESH_NOTE} (draft):`;

/** Service order as originally seeded (before the main-services redesign), to detect a manual reorder. */
const LEGACY_SERVICE_ORDER = [
  "recruitment-and-placements",
  "overseas-employment",
  "domestic-hiring",
  "bulk-manpower-supply",
  "internships",
  "apprenticeships",
  "professional-training",
  "technical-training",
  "welding-and-industrial-testing",
  "skill-assessment",
  "career-development",
  "campus-recruitment",
  "recruitment-management",
  "hr-technology",
  "corporate-workforce-solutions",
  "employer-recruitment-support",
  "training-partnerships",
  "international-mobility-coordination",
];

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local (or set it in the environment).");
    return 1;
  }
  console.log(`Content refresh on ${redactUrl(process.env.DATABASE_URL)}`);

  const { and, asc, eq, inArray, isNull } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { cmsEntries, cmsEntryVersions, roles, userRoles, users } = await import("@/db/schema");
  const service = await import("@/modules/content/service");
  const { createEntrySchema, updateEntrySchema } = await import("@/modules/content/schemas");
  const { buildServiceSeeds } = await import("@/modules/content/seed-content/services");
  const { ABOUT_SEED, HOMEPAGE_SEED, NAVIGATION_SEED, SITE_SETTINGS_SEED } = await import("@/modules/content/seed-content/site");
  type SeedEntrySpec = import("@/modules/content/seed-content/types").SeedEntrySpec;
  type StaffContext = import("@/modules/identity/authz").StaffContext;

  const counts = { inserted: 0, updated: 0, upToDate: 0, skipped: 0, failed: 0 };
  const log = (status: keyof typeof counts, label: string, detail = "") => {
    counts[status] += 1;
    const tag = { inserted: "inserted", updated: "updated", upToDate: "up to date", skipped: "skipped", failed: "failed" }[status];
    console.log(`  [${tag}] ${label}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    // ---- Actor (audit trail) -------------------------------------------------------------------------------
    const email = (process.env.CONTENT_REFRESH_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const admins = await db
      .select({ user: users })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(roles.key, "super_admin"), eq(users.isStaff, true), eq(users.status, "active")))
      .orderBy(asc(users.createdAt));
    const actor = admins.find((a) => email && a.user.email?.toLowerCase() === email)?.user ?? admins[0]?.user;
    if (!actor) {
      console.error("No Super Admin found. Run `npm run db:seed` with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD first.");
      return 1;
    }
    const ctx: StaffContext = {
      user: {
        id: actor.id,
        email: actor.email,
        phone: actor.phone,
        emailVerifiedAt: actor.emailVerifiedAt,
        phoneVerifiedAt: actor.phoneVerifiedAt,
        displayName: actor.displayName,
        avatarFileId: null,
        status: "active",
        isStaff: true,
        locale: "en",
        timezone: null,
        hasPassword: true,
        twoFactorEnabled: true,
      },
      roleKeys: ["super_admin"],
      permissions: new Set(["content.view", "content.edit", "content.publish"]),
      isSuperAdmin: true,
    };
    console.log(`Acting as ${actor.displayName} (Super Admin)`);

    // ---- Entries -------------------------------------------------------------------------------------------
    // Homepage and navigation too: the redesign changed their seeded copy and menus (staff edits are still never overwritten).
    const specs: SeedEntrySpec[] = [SITE_SETTINGS_SEED, HOMEPAGE_SEED, NAVIGATION_SEED, ABOUT_SEED, ...buildServiceSeeds()];

    for (const spec of specs) {
      const label = `${spec.collection}/${spec.slug}`;
      try {
        const [entry] = await db
          .select()
          .from(cmsEntries)
          .where(and(eq(cmsEntries.collection, spec.collection), eq(cmsEntries.slug, spec.slug), eq(cmsEntries.locale, "en")))
          .limit(1);
        const content = { title: spec.title, slug: spec.slug, summary: spec.summary ?? "", data: spec.data, seo: spec.seo ?? {}, tags: spec.tags ?? [] };

        if (!entry) {
          const created = await service.createEntry(
            ctx,
            createEntrySchema.parse({ ...content, collection: spec.collection, locale: "en", note: `${spec.publish ? LIVE_NOTE : DRAFT_NOTE} added from the seed` }),
          );
          if (spec.publish) await service.publishEntry(ctx, { id: created.id, version: created.version });
          log("inserted", label, spec.publish ? "published" : "draft");
          continue;
        }

        const versions = await db
          .select({ version: cmsEntryVersions.version, note: cmsEntryVersions.note, createdByUserId: cmsEntryVersions.createdByUserId })
          .from(cmsEntryVersions)
          .where(eq(cmsEntryVersions.entryId, entry.id));
        const seededCount = 1 + (spec.draftVersions?.length ?? 0);
        const fromRefresh = (v: (typeof versions)[number]) => Boolean(v.note?.startsWith(REFRESH_NOTE));
        const fromSeed = (v: (typeof versions)[number]) => v.createdByUserId === null && v.version <= seededCount;
        const liveIntended = Math.max(1, ...versions.filter((v) => v.note?.startsWith(LIVE_NOTE)).map((v) => v.version));

        let reason: string | null = null;
        if (entry.deletedAt) reason = "moved to the bin by staff";
        else if (entry.scheduledVersion || entry.publishAt || entry.unpublishAt) reason = "has a publication schedule";
        else if (!versions.every((v) => fromSeed(v) || fromRefresh(v))) reason = "edited by staff";
        else if (spec.publish && (entry.status !== "published" || entry.publishedVersion !== liveIntended)) reason = "published state changed by staff";
        else if (!spec.publish && (entry.status !== "draft" || entry.publishedVersion !== null)) reason = "published state changed by staff";

        if (reason) {
          log("skipped", label, reason);
          continue;
        }

        const result = await service.updateEntry(
          ctx,
          updateEntrySchema.parse({
            ...content,
            id: entry.id,
            expectedVersion: entry.currentVersion,
            heroAssetId: entry.heroAssetId ?? undefined,
            note: `${spec.publish ? LIVE_NOTE : DRAFT_NOTE} updated to the current seed content`,
          }),
        );
        if (!result.changed) {
          log("upToDate", label);
          continue;
        }
        if (spec.publish) await service.publishEntry(ctx, { id: entry.id, version: result.version });
        log("updated", label, `version ${result.version}${spec.publish ? " published" : " (draft)"}`);
      } catch (error) {
        log("failed", label, message(error));
      }
    }

    // ---- Services: main services (featured) and order ------------------------------------------------------
    const serviceSpecs = specs.filter((s) => s.collection === "services");
    const rows = await db
      .select({ id: cmsEntries.id, slug: cmsEntries.slug, sortOrder: cmsEntries.sortOrder, isFeatured: cmsEntries.isFeatured, title: cmsEntries.title })
      .from(cmsEntries)
      .where(and(eq(cmsEntries.collection, "services"), eq(cmsEntries.locale, "en"), isNull(cmsEntries.deletedAt)))
      .orderBy(asc(cmsEntries.sortOrder), asc(cmsEntries.title));
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    const atSeedOrder = serviceSpecs.every((s) => !bySlug.has(s.slug) || bySlug.get(s.slug)!.sortOrder === s.sortOrder);
    const atLegacyOrder = LEGACY_SERVICE_ORDER.every((slug, index) => !bySlug.has(slug) || bySlug.get(slug)!.sortOrder === (index + 1) * 10);

    // The featured flag is applied once, together with the new order (while the collection is still in its
    // originally seeded layout and nothing is featured), so a later un-feature by staff is never undone.
    const wantFeatured = serviceSpecs.filter((s) => s.isFeatured).map((s) => s.slug);
    const featuredNow = rows.filter((r) => r.isFeatured).map((r) => r.slug);
    if (wantFeatured.every((slug) => featuredNow.includes(slug)) && featuredNow.length === wantFeatured.length) {
      log("upToDate", "services: main services (featured)");
    } else if (featuredNow.length || !atLegacyOrder) {
      log("skipped", "services: main services (featured)", featuredNow.length ? `staff chose: ${featuredNow.join(", ")}` : "layout changed by staff");
    } else {
      try {
        for (const slug of wantFeatured) {
          const row = bySlug.get(slug);
          if (row) await service.setEntryFeatured(ctx, row.id, true);
        }
        log("updated", "services: main services (featured)", wantFeatured.join(", "));
      } catch (error) {
        log("failed", "services: main services (featured)", message(error));
      }
    }

    if (atSeedOrder) {
      log("upToDate", "services: display order");
    } else if (!atLegacyOrder) {
      log("skipped", "services: display order", "reordered by staff");
    } else {
      try {
        const seeded = serviceSpecs.map((s) => bySlug.get(s.slug)?.id).filter((id): id is string => Boolean(id));
        const others = rows.filter((r) => !seeded.includes(r.id)).map((r) => r.id);
        await service.reorderEntries(ctx, { collection: "services", ids: [...seeded, ...others] });
        log("updated", "services: display order", "main services first, training courses last");
      } catch (error) {
        log("failed", "services: display order", message(error));
      }
    }

    // Sanity: every seeded service exists (informational).
    const missing = serviceSpecs.filter((s) => !bySlug.has(s.slug)).map((s) => s.slug);
    const deleted = missing.length
      ? await db
          .select({ slug: cmsEntries.slug })
          .from(cmsEntries)
          .where(and(eq(cmsEntries.collection, "services"), inArray(cmsEntries.slug, missing)))
      : [];
    if (deleted.length) console.log(`  (services in the bin, left alone: ${deleted.map((d) => d.slug).join(", ")})`);
  } catch (error) {
    console.error("Content refresh failed:", error instanceof Error ? (error.stack ?? error.message) : error);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  console.log(
    `Content refresh finished: ${counts.inserted} inserted, ${counts.updated} updated, ${counts.upToDate} up to date, ${counts.skipped} skipped, ${counts.failed} failed.`,
  );
  return counts.failed ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
