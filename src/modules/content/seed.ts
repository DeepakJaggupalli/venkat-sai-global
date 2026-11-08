import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { cmsEntries, cmsEntryVersions, industries, languages, publicMetrics } from "@/db/schema";
import { sanitizeRichText } from "@/lib/sanitize";
import { audit } from "@/modules/audit";

import { getCollection, validateCollectionData } from "./collections";
import { STANDARD_PUBLIC_METRIC_VALUES } from "./constants";
import { entrySearchText } from "./entry-content";
import { sanitizeRichTextFields } from "./field-walk";
import { LIVE_METRICS } from "./public-metrics";
import { buildDestinationSeeds, buildFaqSeeds, buildIndustrySeeds } from "./seed-content/catalogue";
import { buildLegalPageSeeds } from "./seed-content/legal";
import { buildServiceSeeds, SERVICE_SLUGS } from "./seed-content/services";
import { ABOUT_SEED, HOMEPAGE_SEED, NAVIGATION_SEED, SITE_SETTINGS_SEED } from "./seed-content/site";
import type { SeedEntrySpec, SeedLookups } from "./seed-content/types";
import type { VersionContent } from "./versioning";

/**
 * Idempotent production seed for the content module (called by scripts/seed.ts after the reference data).
 *
 * Insert-only: an entry is created only when no entry with the same collection, slug and language exists —
 * including one an administrator moved to the bin — so admin edits and deletions are never overwritten.
 *
 * Seeds (all copy is factual and claim-free; see seed-content/*):
 *  - published: site settings (legal entity, headquarters and the business contact details), homepage hero and
 *    sections, navigation matching PUBLIC_NAV, the About page (facts only — proposed mission, vision and values
 *    are an unpublished draft version on top), 11 services that reflect existing activities or launch features
 *    (three of them featured as the main services) plus 10 training course families, and 7 legal pages
 *    (version 2026-11-01, internal note: legal review required);
 *
 * Existing databases pick up later seed text through `npm run content:refresh` (scripts/content-refresh.ts),
 * which only touches entries still at their seeded content.
 *  - drafts: 7 further services, 20 industries, 6 GCC destinations (empty, unreviewed guidance) and 10 FAQs;
 *  - public metric definitions for every standard counter, all hidden.
 * Never seeded: testimonials, case studies, news, team members, client logos, statistics.
 */

type Tx = DbOrTx;

export type ContentSeedResult = { entriesCreated: number; entriesSkipped: number; metricsCreated: number };

function prepare(spec: SeedEntrySpec, data: Record<string, unknown>, mode: "draft" | "publish"): Record<string, unknown> {
  const validation = validateCollectionData(spec.collection, data, mode);
  if (!validation.ok) {
    throw new Error(`Content seed "${spec.collection}/${spec.slug}" is invalid: ${JSON.stringify(validation.fieldErrors)}`);
  }
  return sanitizeRichTextFields(getCollection(spec.collection).fields, validation.data, sanitizeRichText);
}

/** Insert one seeded entry with its versions; returns false when it already exists. */
async function seedEntry(spec: SeedEntrySpec, tx: Tx, now: Date): Promise<boolean> {
  const [existing] = await tx
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.collection, spec.collection), eq(cmsEntries.slug, spec.slug), eq(cmsEntries.locale, "en")))
    .limit(1);
  if (existing) return false;

  const base = (data: Record<string, unknown>, title = spec.title, summary = spec.summary): VersionContent => ({
    slug: spec.slug,
    title,
    summary: summary ?? null,
    data,
    seo: spec.seo ?? {},
    tags: spec.tags ?? [],
    heroAssetId: null,
  });
  const versions: { content: VersionContent; note: string }[] = [
    { content: base(prepare(spec, spec.data, spec.publish ? "publish" : "draft")), note: spec.note },
    ...(spec.draftVersions ?? []).map((draft) => ({ content: base(prepare(spec, draft.data, "draft"), draft.title ?? spec.title, draft.summary ?? spec.summary), note: draft.note })),
  ];
  // Live entries keep version 1 on the row; entries that are not live mirror their latest version.
  const rowContent = spec.publish ? versions[0]!.content : versions[versions.length - 1]!.content;
  const [entry] = await tx
    .insert(cmsEntries)
    .values({
      collection: spec.collection,
      locale: "en",
      ...rowContent,
      searchText: entrySearchText(spec.collection, rowContent),
      status: spec.publish ? "published" : "draft",
      currentVersion: versions.length,
      publishedVersion: spec.publish ? 1 : null,
      publishedAt: spec.publish ? now : null,
      sortOrder: spec.sortOrder ?? 0,
      isFeatured: spec.isFeatured ?? false,
    })
    .returning({ id: cmsEntries.id });
  await tx.insert(cmsEntryVersions).values(
    versions.map((v, index) => ({
      entryId: entry!.id,
      version: index + 1,
      ...v.content,
      note: v.note,
    })),
  );
  return true;
}

async function loadLookups(tx: Tx): Promise<SeedLookups> {
  // Sequential: one transaction client.
  const industryRows = await tx.select({ id: industries.id, slug: industries.slug }).from(industries);
  const languageRows = await tx.select({ code: languages.code }).from(languages);
  const serviceRows = await tx
    .select({ id: cmsEntries.id, slug: cmsEntries.slug })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.collection, "services"), eq(cmsEntries.locale, "en"), inArray(cmsEntries.slug, SERVICE_SLUGS)));
  return {
    industryIdBySlug: new Map(industryRows.map((r) => [r.slug, r.id])),
    languageCodes: new Set(languageRows.map((r) => r.code)),
    serviceIdBySlug: new Map(serviceRows.map((r) => [r.slug, r.id])),
  };
}

async function seedPublicMetrics(tx: Tx): Promise<number> {
  const rows = await tx
    .insert(publicMetrics)
    .values(
      STANDARD_PUBLIC_METRIC_VALUES.map((key, index) => ({
        key,
        label: LIVE_METRICS[key].label,
        definition: LIVE_METRICS[key].definition,
        mode: "hidden" as const,
        liveQueryKey: key,
        isVisible: false,
        sortOrder: (index + 1) * 10,
      })),
    )
    .onConflictDoNothing({ target: publicMetrics.key })
    .returning({ id: publicMetrics.id });
  return rows.length;
}

/** Run the content seed. Safe to run on every deploy. */
export async function seedContent(now: Date = new Date()): Promise<ContentSeedResult> {
  return db.transaction(async (tx) => {
    let created = 0;
    let skipped = 0;
    const run = async (specs: SeedEntrySpec[]) => {
      for (const spec of specs) {
        if (await seedEntry(spec, tx, now)) created += 1;
        else skipped += 1;
      }
    };
    await run([SITE_SETTINGS_SEED, HOMEPAGE_SEED, NAVIGATION_SEED, ABOUT_SEED]);
    await run(buildServiceSeeds());
    await run(buildLegalPageSeeds());
    await run(buildFaqSeeds());
    const lookups = await loadLookups(tx);
    await run(buildIndustrySeeds(lookups));
    await run(buildDestinationSeeds(lookups));
    const metricsCreated = await seedPublicMetrics(tx);
    if (created || metricsCreated) {
      await audit({ action: "content.seeded", entityType: "cms_collection", actorType: "system", metadata: { entriesCreated: created, metricsCreated }, tx });
    }
    return { entriesCreated: created, entriesSkipped: skipped, metricsCreated };
  });
}

/** Entry point used by scripts/seed.ts. */
export async function seed(): Promise<void> {
  await seedContent();
}
