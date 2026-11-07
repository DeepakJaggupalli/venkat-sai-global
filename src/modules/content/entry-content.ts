import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { type DbOrTx } from "@/db";
import { cmsEntries, cmsEntryVersions, countries, industries, jobCategories, languages, logoPermissions, skills } from "@/db/schema";
import type { CmsCollection } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { slugify } from "@/lib/http";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";

import { getCollection, validateCollectionData } from "./collections";
import { CMS_COLLECTION_LABELS } from "./constants";
import { collectAssetRefs, collectReferences, extractSearchText, sanitizeRichTextFields, visitLeaves, type AssetRef } from "./field-walk";
import { assertAssetsUsable, findNonPublicAssets, syncMediaUsages, type AssetRequirement } from "./media";
import type { CmsEntryRow, CmsEntryVersionRow, CmsSeo } from "./types";
import { consentAllowsPublication, type VersionContent } from "./versioning";

/**
 * Content preparation shared by the entry services: per-collection validation, rich-text sanitising, media /
 * entry / taxonomy reference checks, publishability rules, search text, slugs and media usage tracking.
 */

type Tx = DbOrTx;
type Json = Record<string, unknown>;

export const MEDIA_ENTITY_TYPE = "cms_entry";

export type ContentInput = {
  slug: string;
  title: string;
  summary?: string | null;
  data: Json;
  seo: CmsSeo;
  tags: string[];
  heroAssetId?: string | null;
};

export function versionContent(row: Pick<CmsEntryVersionRow, "slug" | "title" | "summary" | "data" | "seo" | "tags" | "heroAssetId">): VersionContent {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    data: (row.data ?? {}) as Json,
    seo: (row.seo ?? {}) as CmsSeo,
    tags: row.tags ?? [],
    heroAssetId: row.heroAssetId ?? null,
  };
}

/** Columns of cms_entries / cms_entry_versions holding versioned content. */
export function contentColumns(content: VersionContent): Pick<CmsEntryRow, "slug" | "title" | "summary" | "data" | "seo" | "tags" | "heroAssetId"> {
  return {
    slug: content.slug,
    title: content.title,
    summary: content.summary,
    data: content.data,
    seo: content.seo,
    tags: content.tags,
    heroAssetId: content.heroAssetId,
  };
}

/** Media used by the content (data fields, hero image, social preview image) with media_usages field names. */
export function entryAssetRefs(collection: CmsCollection, content: Pick<VersionContent, "data" | "seo" | "heroAssetId">): AssetRef[] {
  const refs = collectAssetRefs(getCollection(collection).fields, content.data);
  if (content.heroAssetId) refs.push({ assetId: content.heroAssetId, field: "heroAssetId" });
  if (content.seo?.ogImageAssetId) refs.push({ assetId: content.seo.ogImageAssetId, field: "seo.ogImageAssetId" });
  return refs;
}

/** Plain text for the search vector: data text + tags (title and summary are weighted columns of their own). */
export function entrySearchText(collection: CmsCollection, content: Pick<VersionContent, "data" | "tags">): string {
  const text = extractSearchText(getCollection(collection).fields, content.data, stripHtml);
  return [text, ...(content.tags ?? [])].filter(Boolean).join(" ").slice(0, 20_000);
}

function invalid(fieldErrors: Record<string, string[]>, message = "Please correct the highlighted fields."): never {
  throw new ActionError(message, { fieldErrors });
}

/** Check entry / taxonomy / country references inside data. */
async function assertReferencesExist(collection: CmsCollection, data: Json, tx: Tx, selfId: string | null): Promise<void> {
  const refs = collectReferences(getCollection(collection).fields, data);
  const problems: string[] = [];
  for (const [target, ids] of refs.entries) {
    const list = [...ids];
    if (selfId && list.includes(selfId)) problems.push("An entry cannot reference itself.");
    const found = await tx
      .select({ id: cmsEntries.id })
      .from(cmsEntries)
      .where(and(inArray(cmsEntries.id, list), eq(cmsEntries.collection, target), isNull(cmsEntries.deletedAt)));
    if (found.length < list.length) problems.push(`A selected item in ${CMS_COLLECTION_LABELS[target]} no longer exists.`);
  }
  for (const [taxonomy, ids] of refs.taxonomy) {
    const list = [...ids];
    let foundCount = 0;
    if (taxonomy === "languages") foundCount = (await tx.select({ code: languages.code }).from(languages).where(inArray(languages.code, list))).length;
    else if (taxonomy === "industries") foundCount = (await tx.select({ id: industries.id }).from(industries).where(inArray(industries.id, list))).length;
    else if (taxonomy === "job_categories") foundCount = (await tx.select({ id: jobCategories.id }).from(jobCategories).where(inArray(jobCategories.id, list))).length;
    else foundCount = (await tx.select({ id: skills.id }).from(skills).where(inArray(skills.id, list))).length;
    if (foundCount < list.length) problems.push(`A selected ${taxonomy.replace(/_/g, " ").replace(/s$/, "")} no longer exists.`);
  }
  if (refs.countries.size) {
    const list = [...refs.countries];
    const found = await tx.select({ code: countries.code }).from(countries).where(inArray(countries.code, list));
    if (found.length < list.length) problems.push("A selected country is not recognised.");
  }
  if (problems.length) invalid({ data: [...new Set(problems)] }, [...new Set(problems)].join(" "));
}

/** Media requirements of the content (allowed kinds per field). */
function assetRequirements(collection: CmsCollection, content: Pick<VersionContent, "data" | "seo" | "heroAssetId">): AssetRequirement[] {
  const requirements: AssetRequirement[] = [];
  visitLeaves(getCollection(collection).fields, content.data, ({ descriptor, value }) => {
    if (descriptor.type === "asset" && typeof value === "string") requirements.push({ assetId: value, kinds: descriptor.kinds, label: descriptor.label });
    if (descriptor.type === "assets" && Array.isArray(value)) {
      for (const id of value) if (typeof id === "string") requirements.push({ assetId: id, kinds: descriptor.kinds, label: descriptor.label });
    }
  });
  if (content.heroAssetId) requirements.push({ assetId: content.heroAssetId, kinds: ["image"], label: "Hero image" });
  if (content.seo?.ogImageAssetId) requirements.push({ assetId: content.seo.ogImageAssetId, kinds: ["image"], label: "Social preview image" });
  return requirements;
}

/**
 * Validate (draft rules), normalise and sanitise content for a save. Throws ActionError with fieldErrors
 * (`data.<path>`, `heroAssetId`…) on problems.
 */
export async function prepareEntryContent(collection: CmsCollection, input: ContentInput, tx: Tx, selfId: string | null = null): Promise<VersionContent> {
  const validation = validateCollectionData(collection, input.data, "draft");
  if (!validation.ok) invalid(validation.fieldErrors);
  const definition = getCollection(collection);
  const data = sanitizeRichTextFields(definition.fields, validation.data, sanitizeRichText);
  const content: VersionContent = {
    slug: input.slug,
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    data,
    seo: input.seo ?? {},
    tags: input.tags ?? [],
    heroAssetId: input.heroAssetId ?? null,
  };
  await assertAssetsUsable(assetRequirements(collection, content), tx, "data");
  await assertReferencesExist(collection, data, tx, selfId);
  return content;
}

/**
 * Rules for making a version live now: publish-mode validation, consent of featured people, logo permission,
 * and public media only. Throws a single ActionError explaining what to fix.
 */
export async function assertPublishable(
  entry: Pick<CmsEntryRow, "id" | "collection" | "consentStatus" | "consentExpiresAt" | "logoPermissionId">,
  content: VersionContent,
  now: Date,
  tx: Tx,
): Promise<void> {
  const definition = getCollection(entry.collection);
  if (!content.title.trim()) invalid({ title: ["Enter a title"] }, "Enter a title before publishing.");
  const validation = validateCollectionData(entry.collection, content.data, "publish");
  if (!validation.ok) {
    const first = Object.values(validation.fieldErrors)[0]?.[0];
    invalid(validation.fieldErrors, `This version is not complete enough to publish${first ? `: ${first}` : "."}`);
  }
  if (definition.consentRequired && !consentAllowsPublication(entry, now)) {
    throw new ActionError(
      entry.consentStatus === "obtained"
        ? "The recorded consent has expired. Record a new consent before publishing."
        : `${definition.singularLabel}s need the featured person's or organisation's consent (status obtained, with evidence) before publishing.`,
      { code: "consent_required" },
    );
  }
  if (entry.collection === "client_logos") {
    if (!entry.logoPermissionId) throw new ActionError("Link an approved logo permission before publishing this logo.", { code: "logo_permission_required" });
    const [permission] = await tx
      .select({ status: logoPermissions.status, expiresAt: logoPermissions.expiresAt })
      .from(logoPermissions)
      .where(eq(logoPermissions.id, entry.logoPermissionId))
      .limit(1);
    if (!permission || permission.status !== "approved" || (permission.expiresAt && permission.expiresAt.getTime() <= now.getTime())) {
      throw new ActionError("The linked logo permission is not approved or has expired.", { code: "logo_permission_required" });
    }
  }
  const nonPublic = await findNonPublicAssets(
    entryAssetRefs(entry.collection, content).map((r) => r.assetId),
    tx,
  );
  if (nonPublic.length) {
    const names = nonPublic.slice(0, 4).map((a) => `"${a.title}"`).join(", ");
    throw new ActionError(`These media items are not public yet: ${names}${nonPublic.length > 4 ? " and more" : ""}. Make them public in the media library first.`, {
      code: "media_not_public",
    });
  }
}

/** A free slug in (collection, locale): `base`, `base-2`, `base-3`… (soft-deleted entries count as taken). */
export async function uniqueSlugFor(collection: CmsCollection, locale: string, base: string, tx: Tx, excludeId?: string): Promise<string> {
  const root = (slugify(base, 180) || "item").replace(/\/+/g, "-");
  const rows = await tx
    .select({ slug: cmsEntries.slug })
    .from(cmsEntries)
    .where(
      and(
        eq(cmsEntries.collection, collection),
        eq(cmsEntries.locale, locale),
        sql`(${cmsEntries.slug} = ${root} or ${cmsEntries.slug} like ${`${root}-%`})`,
        excludeId ? ne(cmsEntries.id, excludeId) : undefined,
      ),
    );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

/** Throws when a live (not deleted) entry other than `entryId` uses the slug. */
export async function assertSlugAvailable(collection: CmsCollection, locale: string, slug: string, entryId: string | null, tx: Tx): Promise<void> {
  const [clash] = await tx
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(
      and(
        eq(cmsEntries.collection, collection),
        eq(cmsEntries.locale, locale),
        eq(cmsEntries.slug, slug),
        isNull(cmsEntries.deletedAt),
        entryId ? ne(cmsEntries.id, entryId) : undefined,
      ),
    )
    .limit(1);
  if (clash) invalid({ slug: ["This slug is already used in this collection and language"] }, "This URL slug is already used. Choose another slug.");
}

/**
 * Make `slug` usable by `entryId` on the row: refuse when a live entry holds it; rename a soft-deleted entry
 * that still holds it (its slug becomes "<slug>-deleted-<id prefix>", so it stays restorable).
 */
export async function claimSlug(collection: CmsCollection, locale: string, slug: string, entryId: string | null, tx: Tx): Promise<void> {
  await assertSlugAvailable(collection, locale, slug, entryId, tx);
  const deleted = await tx
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.collection, collection), eq(cmsEntries.locale, locale), eq(cmsEntries.slug, slug), sql`${cmsEntries.deletedAt} is not null`));
  for (const row of deleted) {
    if (row.id === entryId) continue;
    const renamed = `${slug.slice(0, 170)}-deleted-${row.id.slice(0, 8)}`;
    await tx.update(cmsEntries).set({ slug: renamed }).where(eq(cmsEntries.id, row.id));
  }
}

/**
 * Recompute media usage of an entry: assets referenced by the row (live or mirrored content), the latest
 * version and a pinned scheduled version. Soft-deleted entries keep no usage.
 */
export async function syncEntryUsages(entryId: string, tx: Tx): Promise<void> {
  const [entry] = await tx.select().from(cmsEntries).where(eq(cmsEntries.id, entryId)).limit(1);
  if (!entry || entry.deletedAt) {
    await syncMediaUsages(MEDIA_ENTITY_TYPE, entryId, [], tx);
    return;
  }
  const versionNumbers = [...new Set([entry.currentVersion, entry.scheduledVersion].filter((v): v is number => v !== null))];
  const versions = await tx
    .select()
    .from(cmsEntryVersions)
    .where(and(eq(cmsEntryVersions.entryId, entryId), inArray(cmsEntryVersions.version, versionNumbers)));
  const refs = [entry, ...versions].flatMap((row) => entryAssetRefs(entry.collection, versionContent(row)));
  await syncMediaUsages(MEDIA_ENTITY_TYPE, entryId, refs, tx);
}
