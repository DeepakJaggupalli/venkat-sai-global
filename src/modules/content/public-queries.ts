import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { cmsEntries, cmsEntryVersions, logoPermissions, type CmsCollection, type CmsSingletonCollection, type LogoDisplayLocation } from "@/db/schema";
import { paginated } from "@/lib/http";
import { logger } from "@/lib/logger";

import { type CollectionData, collectionDataSchema, getCollection, isCmsCollection, publicPathFor } from "./collections";
import { CMS_COLLECTION_VALUES, DEFAULT_CONTENT_LOCALE, singletonSlug } from "./constants";
import { entryAssetRefs, versionContent } from "./entry-content";
import { collectReferences, stripInternalFields } from "./field-walk";
import { dropUndefined } from "./fields";
import { resolvePublicAssets } from "./media";
import { verifyPreviewToken } from "./preview";
import type { CmsEntryRow, CmsSeo, ContentSearchResult, PublishedEntry, PublishedEntryDetail, PublishedEntryPage, ReferenceMap, ResolvedContent } from "./types";

/**
 * Public read API of the CMS. Everything here returns published content only (status published, not deleted,
 * consent still valid for consent-required collections, logo permission approved and unexpired for client logos),
 * with internal fields stripped — except when a valid preview token is passed, which renders that entry's
 * draft (callers must then show a "Preview" ribbon and send noindex).
 */

type Json = Record<string, unknown>;

const CONSENT_REQUIRED = ["testimonials", "case_studies", "team_members"] as const;

function publishedCondition(now: Date): SQL {
  return and(
    eq(cmsEntries.status, "published"),
    isNull(cmsEntries.deletedAt),
    sql`${cmsEntries.publishedVersion} is not null`,
    sql`(${cmsEntries.collection} not in (${sql.join(
      CONSENT_REQUIRED.map((c) => sql`${c}`),
      sql`, `,
    )}) or (${cmsEntries.consentStatus} = 'obtained' and (${cmsEntries.consentExpiresAt} is null or ${cmsEntries.consentExpiresAt} > ${now})))`,
  )!;
}

/** Published data as the public may see it: validated for publication when possible, internal fields always removed. */
function toPublicData(collection: CmsCollection, data: unknown): Json {
  const parsed = collectionDataSchema(collection, "publish", { omitInternal: true }).safeParse(data ?? {});
  if (parsed.success) return dropUndefined(parsed.data);
  // Older versions may predate a schema change; render what is there rather than failing the page.
  logger.warn("CMS data no longer matches its collection schema", { collection, issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")) });
  return stripInternalFields(getCollection(collection).fields, data);
}

/** Draft data for preview: same stripping, lenient about incomplete drafts. */
function toPreviewData(collection: CmsCollection, data: unknown): Json {
  const parsed = collectionDataSchema(collection, "draft", { omitInternal: true }).safeParse(data ?? {});
  return parsed.success ? dropUndefined(parsed.data) : stripInternalFields(getCollection(collection).fields, data);
}

type EntrySelection = { entry: CmsEntryRow; contentUpdatedAt: Date | null; logoName: string | null; logoRelationship: string | null };

function toPublishedEntry<K extends CmsCollection>(row: EntrySelection): PublishedEntry<K> {
  const { entry } = row;
  return {
    id: entry.id,
    collection: entry.collection as K,
    slug: entry.slug,
    locale: entry.locale,
    title: entry.title,
    summary: entry.summary,
    data: toPublicData(entry.collection, entry.data) as CollectionData<K>,
    seo: (entry.seo ?? {}) as CmsSeo,
    tags: entry.tags,
    isFeatured: entry.isFeatured,
    sortOrder: entry.sortOrder,
    heroAssetId: entry.heroAssetId,
    publishedAt: entry.publishedAt ?? entry.updatedAt,
    contentUpdatedAt: row.contentUpdatedAt ?? entry.publishedAt ?? entry.updatedAt,
    path: publicPathFor(entry.collection, entry.slug),
    logo:
      entry.collection === "client_logos" && row.logoName && row.logoRelationship
        ? { organizationName: row.logoName, relationship: row.logoRelationship as NonNullable<PublishedEntry["logo"]>["relationship"] }
        : null,
  };
}

const publishedVersion = alias(cmsEntryVersions, "published_version");

function selectPublished() {
  return db
    .select({
      entry: cmsEntries,
      contentUpdatedAt: publishedVersion.createdAt,
      logoName: logoPermissions.organizationName,
      logoRelationship: logoPermissions.relationship,
    })
    .from(cmsEntries)
    .leftJoin(publishedVersion, and(eq(publishedVersion.entryId, cmsEntries.id), eq(publishedVersion.version, cmsEntries.publishedVersion)))
    .leftJoin(logoPermissions, eq(logoPermissions.id, cmsEntries.logoPermissionId));
}

function logoCondition(location: LogoDisplayLocation, now: Date): SQL {
  return and(
    eq(logoPermissions.status, "approved"),
    sql`(${logoPermissions.expiresAt} is null or ${logoPermissions.expiresAt} > ${now})`,
    sql`${logoPermissions.displayLocations} @> array[${location}]::text[]`,
  )!;
}

/** Resolve public media and referenced published entries (one level) for a set of entries. */
/** Minimal shape needed to resolve an entry's media and references (any collection). */
type ResolvableEntry = Pick<PublishedEntry, "id" | "collection" | "seo" | "heroAssetId"> & { data: unknown };

async function resolveContent(entries: readonly ResolvableEntry[], now: Date): Promise<ResolvedContent> {
  const referenceIds = new Set<string>();
  for (const entry of entries) {
    const refs = collectReferences(getCollection(entry.collection).fields, entry.data);
    for (const ids of refs.entries.values()) for (const id of ids) referenceIds.add(id);
  }
  const ownIds = new Set(entries.map((e) => e.id));
  const toFetch = [...referenceIds].filter((id) => !ownIds.has(id));
  const references: ReferenceMap = {};
  if (toFetch.length) {
    const rows = await selectPublished().where(and(inArray(cmsEntries.id, toFetch), publishedCondition(now), sql`(${cmsEntries.collection} <> 'client_logos')`));
    for (const row of rows) references[row.entry.id] = toPublishedEntry(row);
  }
  // An entry referenced by another entry in the same result (generic K narrowed back to the union type).
  for (const entry of entries) if (referenceIds.has(entry.id)) references[entry.id] = entry as unknown as PublishedEntry;
  const assetIds = [...entries, ...Object.values(references)].flatMap((e) =>
    entryAssetRefs(e.collection, { data: e.data as Json, seo: e.seo, heroAssetId: e.heroAssetId }).map((r) => r.assetId),
  );
  return { assets: await resolvePublicAssets(assetIds), references };
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

async function previewEntry<K extends CmsCollection>(token: string, match: { collection: K; slug?: string }, now: Date): Promise<PublishedEntry<K> | null> {
  const payload = verifyPreviewToken(token, now);
  if (!payload) return null;
  const [entry] = await db.select().from(cmsEntries).where(and(eq(cmsEntries.id, payload.entryId), isNull(cmsEntries.deletedAt))).limit(1);
  if (!entry || entry.collection !== match.collection) return null;
  const versionNumber = payload.version === "latest" ? entry.currentVersion : payload.version;
  const [version] = await db
    .select()
    .from(cmsEntryVersions)
    .where(and(eq(cmsEntryVersions.entryId, entry.id), eq(cmsEntryVersions.version, versionNumber)))
    .limit(1);
  if (!version) return null;
  if (match.slug !== undefined && match.slug !== entry.slug && match.slug !== version.slug) return null;
  const content = versionContent(version);
  return {
    id: entry.id,
    collection: entry.collection as K,
    slug: content.slug,
    locale: entry.locale,
    title: content.title,
    summary: content.summary,
    data: toPreviewData(entry.collection, content.data) as CollectionData<K>,
    seo: { ...content.seo, noindex: true },
    tags: content.tags,
    isFeatured: entry.isFeatured,
    sortOrder: entry.sortOrder,
    heroAssetId: content.heroAssetId,
    publishedAt: entry.publishedAt ?? version.createdAt,
    contentUpdatedAt: version.createdAt,
    path: publicPathFor(entry.collection, content.slug),
    logo: null,
  };
}

/**
 * Where a preview token points (for a generic /preview?token= route that redirects to the right page).
 * Null when the token is invalid, expired or the entry is gone.
 */
export async function resolvePreviewTarget(token: string, now: Date = new Date()): Promise<{ collection: CmsCollection; slug: string; path: string | null } | null> {
  const payload = verifyPreviewToken(token, now);
  if (!payload) return null;
  const [entry] = await db
    .select({ id: cmsEntries.id, collection: cmsEntries.collection, currentVersion: cmsEntries.currentVersion })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.id, payload.entryId), isNull(cmsEntries.deletedAt)))
    .limit(1);
  if (!entry) return null;
  const [version] = await db
    .select({ slug: cmsEntryVersions.slug })
    .from(cmsEntryVersions)
    .where(and(eq(cmsEntryVersions.entryId, entry.id), eq(cmsEntryVersions.version, payload.version === "latest" ? entry.currentVersion : payload.version)))
    .limit(1);
  if (!version) return null;
  return { collection: entry.collection, slug: version.slug, path: publicPathFor(entry.collection, version.slug) };
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export type PublicReadOptions = {
  /** Content language (default "en"); singletons and slugs fall back to English when missing. */
  locale?: string;
  /** Preview token from `?preview=`: renders that entry's draft when valid. */
  preview?: string | null;
  /** Clock override (tests). */
  now?: Date;
};

/**
 * A published singleton (site_settings, homepage, navigation, about) with its media and referenced entries,
 * or null when it does not exist or is not published (callers fall back to built-in defaults).
 */
export async function getSingleton<K extends CmsSingletonCollection>(key: K, opts: PublicReadOptions = {}): Promise<PublishedEntryDetail<K> | null> {
  return getPublishedEntryBySlug(key, singletonSlug(key), opts);
}

/** Just the typed data of a published singleton (null when unavailable). */
export async function getSingletonData<K extends CmsSingletonCollection>(key: K, opts: PublicReadOptions = {}): Promise<CollectionData<K> | null> {
  return (await getSingleton(key, opts))?.entry.data ?? null;
}

/**
 * One published entry by slug (with resolved media and references), or null → render 404.
 * With a valid `preview` token for this entry, its draft is returned instead (`preview: true`).
 */
export async function getPublishedEntryBySlug<K extends CmsCollection>(collection: K, slug: string, opts: PublicReadOptions = {}): Promise<PublishedEntryDetail<K> | null> {
  if (!isCmsCollection(collection) || typeof slug !== "string" || slug.length > 200) return null;
  const now = opts.now ?? new Date();
  if (opts.preview) {
    const draft = await previewEntry(opts.preview, { collection, slug }, now);
    if (draft) return { entry: draft, ...(await resolveContent([draft], now)), preview: true };
  }
  if (collection === "client_logos") return null;
  const locales = [...new Set([opts.locale ?? DEFAULT_CONTENT_LOCALE, DEFAULT_CONTENT_LOCALE])];
  const rows = await selectPublished()
    .where(and(eq(cmsEntries.collection, collection), eq(cmsEntries.slug, slug), inArray(cmsEntries.locale, locales), publishedCondition(now)))
    .limit(2);
  const row = rows.find((r) => r.entry.locale === locales[0]) ?? rows[0];
  if (!row) return null;
  const entry = toPublishedEntry<K>(row);
  return { entry, ...(await resolveContent([entry], now)), preview: false };
}

export type PublishedListOptions = {
  locale?: string;
  /** Value of the collection's category field (news category, event type, testimonial type, FAQ audience, destination region…). */
  category?: string;
  featured?: boolean;
  tag?: string;
  page?: number;
  /** Page size (default 12, max 100). `limit` is an alias. */
  pageSize?: number;
  limit?: number;
  /** Events: only events that have not ended (true) or only past events (false). */
  upcoming?: boolean;
  /** Required for client_logos: only logos whose approved permission covers this location are returned. */
  logoLocation?: LogoDisplayLocation;
  excludeIds?: string[];
  now?: Date;
};

function eventEndExpr(): SQL {
  return sql`(case when coalesce(${cmsEntries.data}->>'endsAt', ${cmsEntries.data}->>'startsAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then coalesce(${cmsEntries.data}->>'endsAt', ${cmsEntries.data}->>'startsAt')::timestamptz end)`;
}

function eventStartExpr(): SQL {
  return sql`(case when ${cmsEntries.data}->>'startsAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (${cmsEntries.data}->>'startsAt')::timestamptz end)`;
}

/**
 * Published entries of a collection, paginated, with the media and referenced entries they use.
 * Ordering follows the collection (manual order, newest first, or event start). Services switched to
 * "not currently offered" are left out of listings (still reachable by slug).
 */
export async function getPublishedEntries<K extends CmsCollection>(collection: K, opts: PublishedListOptions = {}): Promise<PublishedEntryPage<K>> {
  const now = opts.now ?? new Date();
  const definition = getCollection(collection);
  const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize ?? opts.limit ?? 12), 1), 100);
  const page = Math.max(Math.trunc(opts.page ?? 1), 1);
  const where: SQL[] = [eq(cmsEntries.collection, collection), eq(cmsEntries.locale, opts.locale ?? DEFAULT_CONTENT_LOCALE), publishedCondition(now)];
  if (opts.category && definition.categoryField) where.push(sql`${cmsEntries.data}->>${definition.categoryField} = ${opts.category}`);
  if (opts.featured !== undefined) where.push(eq(cmsEntries.isFeatured, opts.featured));
  if (opts.tag) where.push(sql`${cmsEntries.tags} @> array[${opts.tag.toLowerCase()}]::text[]`);
  if (opts.excludeIds?.length) where.push(sql`${cmsEntries.id} not in (${sql.join(opts.excludeIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  if (collection === "services") where.push(sql`coalesce(${cmsEntries.data}->>'isActive', 'true') <> 'false'`);
  if (collection === "events" && opts.upcoming !== undefined) {
    where.push(opts.upcoming ? sql`${eventEndExpr()} >= ${now}` : sql`${eventEndExpr()} < ${now}`);
  }
  if (collection === "client_logos") {
    if (!opts.logoLocation) throw new TypeError("getPublishedEntries('client_logos') needs a logoLocation: logos may only appear where their permission allows.");
    where.push(logoCondition(opts.logoLocation, now));
  }
  const condition = and(...where);
  const order =
    definition.defaultSort === "newest"
      ? [desc(cmsEntries.publishedAt), desc(cmsEntries.createdAt)]
      : definition.defaultSort === "event_start"
        ? opts.upcoming === false
          ? [sql`${eventStartExpr()} desc nulls last`]
          : [sql`${eventStartExpr()} asc nulls last`]
        : [asc(cmsEntries.sortOrder), asc(cmsEntries.title)];
  const [rows, totals] = await Promise.all([
    selectPublished()
      .where(condition)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(cmsEntries)
      .leftJoin(logoPermissions, eq(logoPermissions.id, cmsEntries.logoPermissionId))
      .where(condition),
  ]);
  const items = rows.map((row) => toPublishedEntry<K>(row));
  const resolved = await resolveContent(items, now);
  return { ...paginated(items, totals[0]?.value ?? 0, { page, pageSize }), ...resolved };
}

/** Published entries by id (e.g. homepage featured items), in the given order, missing ones skipped. */
export async function getPublishedEntriesByIds(ids: string[], opts: { now?: Date } = {}): Promise<PublishedEntry[]> {
  const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!unique.length) return [];
  const now = opts.now ?? new Date();
  const rows = await selectPublished().where(and(inArray(cmsEntries.id, unique), publishedCondition(now), sql`${cmsEntries.collection} <> 'client_logos'`));
  const byId = new Map(rows.map((r) => [r.entry.id, toPublishedEntry(r)]));
  return unique.map((id) => byId.get(id)).filter((e): e is PublishedEntry => Boolean(e));
}

/** Slugs and lastmod of published entries that have their own page (sitemap.ts). */
export async function getPublishedSlugs(collection: CmsCollection, opts: { locale?: string; now?: Date } = {}): Promise<{ slug: string; path: string; contentUpdatedAt: Date }[]> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select({ slug: cmsEntries.slug, publishedAt: cmsEntries.publishedAt, versionCreatedAt: publishedVersion.createdAt })
    .from(cmsEntries)
    .leftJoin(publishedVersion, and(eq(publishedVersion.entryId, cmsEntries.id), eq(publishedVersion.version, cmsEntries.publishedVersion)))
    .where(and(eq(cmsEntries.collection, collection), eq(cmsEntries.locale, opts.locale ?? DEFAULT_CONTENT_LOCALE), publishedCondition(now)))
    .orderBy(asc(cmsEntries.slug));
  const out: { slug: string; path: string; contentUpdatedAt: Date }[] = [];
  for (const row of rows) {
    const path = publicPathFor(collection, row.slug);
    if (!path || (collection !== "pages" && out.some((o) => o.path === path))) continue;
    out.push({ slug: row.slug, path, contentUpdatedAt: row.versionCreatedAt ?? row.publishedAt ?? now });
  }
  return out;
}

/** Collections included in site search (flag on the collection definition). */
const SEARCHABLE: readonly CmsCollection[] = CMS_COLLECTION_VALUES.filter((c) => getCollection(c).searchable);

/**
 * Public site search over published content (title > summary > body text). `q` is 2–100 characters of
 * free text (websearch syntax: quotes, OR, -word). Rate-limit the calling route.
 */
export async function searchContent(
  q: string,
  opts: { limit?: number; locale?: string; collections?: CmsCollection[]; now?: Date } = {},
): Promise<ContentSearchResult[]> {
  const query = q.trim().replace(/\s+/g, " ");
  if (query.length < 2 || query.length > 100) return [];
  const now = opts.now ?? new Date();
  const collections = opts.collections?.length ? opts.collections.filter((c) => SEARCHABLE.includes(c)) : [...SEARCHABLE];
  if (!collections.length) return [];
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), 50);
  const tsQuery = sql`websearch_to_tsquery('simple', ${query})`;
  const rows = await db
    .select({
      collection: cmsEntries.collection,
      slug: cmsEntries.slug,
      title: cmsEntries.title,
      summary: cmsEntries.summary,
      rank: sql<number>`ts_rank_cd(${cmsEntries.searchVector}, ${tsQuery})`,
      snippet: sql<string | null>`ts_headline('simple', left(coalesce(${cmsEntries.summary}, '') || ' ' || coalesce(${cmsEntries.searchText}, ''), 5000), ${tsQuery}, 'StartSel=«, StopSel=», MaxWords=30, MinWords=12, MaxFragments=1')`,
    })
    .from(cmsEntries)
    .where(
      and(
        inArray(cmsEntries.collection, collections),
        eq(cmsEntries.locale, opts.locale ?? DEFAULT_CONTENT_LOCALE),
        publishedCondition(now),
        sql`${cmsEntries.searchVector} @@ ${tsQuery}`,
        sql`coalesce(${cmsEntries.seo}->>'noindex', 'false') <> 'true'`,
      ),
    )
    .orderBy(sql`ts_rank_cd(${cmsEntries.searchVector}, ${tsQuery}) desc`, asc(cmsEntries.title))
    .limit(limit);
  return rows
    .map((row) => ({ ...row, rank: Number(row.rank), path: publicPathFor(row.collection, row.slug) }))
    .filter((row): row is ContentSearchResult => row.path !== null);
}
