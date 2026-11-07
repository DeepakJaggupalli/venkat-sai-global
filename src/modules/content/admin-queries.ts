import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { approvalRequests, cmsEntries, cmsEntryVersions, logoPermissions, mediaUsages, users, type CmsCollection, type CmsEntryStatus } from "@/db/schema";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import type { StaffContext } from "@/modules/identity/authz";

import { getCollection, publicPathFor } from "./collections";
import { CMS_COLLECTION_VALUES, isSingletonCollection, singletonSlug } from "./constants";
import { versionContent } from "./entry-content";
import { assertStaff, likePattern } from "./internal";
import type { EntryListFilters } from "./schemas";
import type { AdminEntryDetail, AdminEntryListItem, EditableContent, EntryApprovalSummary, EntryVersionDiff, EntryVersionSummary } from "./types";
import { diffVersionContent, hasUnpublishedChanges } from "./versioning";

/**
 * Command Centre reads for CMS entries (content.view). Admin views see every status, draft content and history;
 * nothing here is for the public site.
 */

const updatedBy = alias(users, "updated_by");
const OPEN_APPROVAL_STATUSES = ["pending", "in_review", "escalated", "changes_requested"] as const;
const ENTRY_APPROVAL_TYPES = ["content_publication", "testimonial", "case_study"] as const;

function assertView(ctx: StaffContext): void {
  assertStaff(ctx, ["content.view", "content.edit"], "You do not have permission to view content.", "any");
}

/** Entries of a collection for the admin list (filters, search, sort, bin). */
export async function listEntries(ctx: StaffContext, filters: EntryListFilters, page: PageQuery): Promise<Paginated<AdminEntryListItem>> {
  assertView(ctx);
  const where: SQL[] = [eq(cmsEntries.collection, filters.collection)];
  where.push(filters.deleted ? sql`${cmsEntries.deletedAt} is not null` : isNull(cmsEntries.deletedAt));
  if (filters.status) where.push(eq(cmsEntries.status, filters.status));
  if (filters.locale) where.push(eq(cmsEntries.locale, filters.locale));
  if (filters.tag) where.push(sql`${cmsEntries.tags} @> array[${filters.tag}]::text[]`);
  if (filters.featured) where.push(eq(cmsEntries.isFeatured, true));
  if (filters.q) {
    // Title / slug match on the row, or on the latest saved version (drafts of live entries).
    const pattern = likePattern(filters.q);
    where.push(
      or(
        ilike(cmsEntries.title, pattern),
        ilike(cmsEntries.slug, pattern),
        sql`exists (select 1 from cms_entry_versions v where v.entry_id = ${cmsEntries.id} and v.version = ${cmsEntries.currentVersion} and v.title ilike ${pattern})`,
      )!,
    );
  }
  const condition = and(...where);
  const sort = filters.sort ?? (getCollection(filters.collection).defaultSort === "manual" ? "manual" : "updated");
  const order =
    sort === "manual"
      ? [asc(cmsEntries.sortOrder), asc(cmsEntries.title)]
      : sort === "title"
        ? [asc(cmsEntries.title)]
        : sort === "published"
          ? [sql`${cmsEntries.publishedAt} desc nulls last`]
          : [desc(cmsEntries.updatedAt)];
  const [rows, totals] = await Promise.all([
    db
      .select({
        entry: {
          id: cmsEntries.id,
          collection: cmsEntries.collection,
          slug: cmsEntries.slug,
          locale: cmsEntries.locale,
          title: cmsEntries.title,
          status: cmsEntries.status,
          currentVersion: cmsEntries.currentVersion,
          publishedVersion: cmsEntries.publishedVersion,
          scheduledVersion: cmsEntries.scheduledVersion,
          publishAt: cmsEntries.publishAt,
          unpublishAt: cmsEntries.unpublishAt,
          isFeatured: cmsEntries.isFeatured,
          sortOrder: cmsEntries.sortOrder,
          consentStatus: cmsEntries.consentStatus,
          updatedAt: cmsEntries.updatedAt,
          deletedAt: cmsEntries.deletedAt,
        },
        latestTitle: sql<string | null>`(select v.title from cms_entry_versions v where v.entry_id = ${cmsEntries.id} and v.version = ${cmsEntries.currentVersion})`,
        updatedByName: updatedBy.displayName,
      })
      .from(cmsEntries)
      .leftJoin(updatedBy, eq(updatedBy.id, cmsEntries.updatedByUserId))
      .where(condition)
      .orderBy(...order)
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(cmsEntries).where(condition),
  ]);
  const items: AdminEntryListItem[] = rows.map(({ entry, latestTitle, updatedByName }) => ({
    ...entry,
    title: latestTitle ?? entry.title,
    hasUnpublishedChanges: hasUnpublishedChanges(entry),
    updatedByName,
    path: entry.status === "published" ? publicPathFor(entry.collection, entry.slug) : null,
  }));
  return paginated(items, totals[0]?.value ?? 0, page);
}

function toApprovalSummary(row: typeof approvalRequests.$inferSelect | undefined): EntryApprovalSummary | null {
  if (!row) return null;
  return { id: row.id, code: row.code, type: row.type, status: row.status, createdAt: row.createdAt, decisionReason: row.decisionReason };
}

/** Everything the entry editor needs: row state, latest editable content, version history, approvals, logo permission. */
export async function getEntryDetail(ctx: StaffContext, entryId: string): Promise<AdminEntryDetail | null> {
  assertView(ctx);
  const [entry] = await db.select().from(cmsEntries).where(eq(cmsEntries.id, entryId)).limit(1);
  if (!entry) return null;
  const versionCreator = alias(users, "version_creator");
  const [versions, approvals, logo, usage] = await Promise.all([
    db
      .select({
        version: cmsEntryVersions.version,
        title: cmsEntryVersions.title,
        note: cmsEntryVersions.note,
        createdAt: cmsEntryVersions.createdAt,
        createdByName: versionCreator.displayName,
      })
      .from(cmsEntryVersions)
      .leftJoin(versionCreator, eq(versionCreator.id, cmsEntryVersions.createdByUserId))
      .where(eq(cmsEntryVersions.entryId, entryId))
      .orderBy(desc(cmsEntryVersions.version))
      .limit(200),
    db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.entityId, entryId), inArray(approvalRequests.type, [...ENTRY_APPROVAL_TYPES])))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(10),
    entry.logoPermissionId
      ? db
          .select({
            id: logoPermissions.id,
            organizationName: logoPermissions.organizationName,
            status: logoPermissions.status,
            expiresAt: logoPermissions.expiresAt,
            displayLocations: logoPermissions.displayLocations,
          })
          .from(logoPermissions)
          .where(eq(logoPermissions.id, entry.logoPermissionId))
          .limit(1)
      : Promise.resolve([]),
    db.select({ value: count() }).from(mediaUsages).where(and(eq(mediaUsages.entityType, "cms_entry"), eq(mediaUsages.entityId, entryId))),
  ]);
  const [latestRow] = await db
    .select()
    .from(cmsEntryVersions)
    .where(and(eq(cmsEntryVersions.entryId, entryId), eq(cmsEntryVersions.version, entry.currentVersion)))
    .limit(1);
  const latest: EditableContent = latestRow
    ? { version: latestRow.version, ...versionContent(latestRow) }
    : { version: entry.currentVersion, ...versionContent(entry) };
  const versionList: EntryVersionSummary[] = versions.map((v) => ({
    ...v,
    isCurrent: v.version === entry.currentVersion,
    isPublished: v.version === entry.publishedVersion,
    isScheduled: v.version === entry.scheduledVersion,
  }));
  const open = approvals.find((a) => (OPEN_APPROVAL_STATUSES as readonly string[]).includes(a.status));
  const { searchVector: _sv, searchText: _st, ...row } = entry;
  void _sv;
  void _st;
  return {
    entry: row,
    latest,
    versions: versionList,
    hasUnpublishedChanges: hasUnpublishedChanges(entry),
    openApproval: toApprovalSummary(open),
    latestApproval: toApprovalSummary(approvals[0]),
    publicPath: publicPathFor(entry.collection, latest.slug),
    logoPermission: logo[0] ?? null,
    mediaUsageCount: usage[0]?.value ?? 0,
  };
}

/** The singleton entry of a collection for editing (null when not created yet). */
export async function getSingletonForEditing(ctx: StaffContext, collection: CmsCollection, locale = "en"): Promise<AdminEntryDetail | null> {
  assertView(ctx);
  if (!isSingletonCollection(collection)) return null;
  const [row] = await db
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.collection, collection), eq(cmsEntries.locale, locale), eq(cmsEntries.slug, singletonSlug(collection))))
    .limit(1);
  return row ? getEntryDetail(ctx, row.id) : null;
}

/** One saved version in full (history view). */
export async function getEntryVersion(
  ctx: StaffContext,
  entryId: string,
  version: number,
): Promise<(EditableContent & { note: string | null; createdAt: Date; createdByName: string | null }) | null> {
  assertView(ctx);
  const [row] = await db
    .select({ version: cmsEntryVersions, createdByName: users.displayName })
    .from(cmsEntryVersions)
    .leftJoin(users, eq(users.id, cmsEntryVersions.createdByUserId))
    .where(and(eq(cmsEntryVersions.entryId, entryId), eq(cmsEntryVersions.version, version)))
    .limit(1);
  if (!row) return null;
  return { version: row.version.version, ...versionContent(row.version), note: row.version.note, createdAt: row.version.createdAt, createdByName: row.createdByName };
}

/** Field-level differences between two versions (labels from the collection's descriptors). */
export async function compareEntryVersions(ctx: StaffContext, entryId: string, from: number, to: number): Promise<EntryVersionDiff | null> {
  assertView(ctx);
  const [entry] = await db.select({ collection: cmsEntries.collection }).from(cmsEntries).where(eq(cmsEntries.id, entryId)).limit(1);
  if (!entry) return null;
  const rows = await db
    .select()
    .from(cmsEntryVersions)
    .where(and(eq(cmsEntryVersions.entryId, entryId), inArray(cmsEntryVersions.version, [from, to])));
  const a = rows.find((r) => r.version === from);
  const b = rows.find((r) => r.version === to);
  if (!a || !b) return null;
  return { entryId, from, to, changes: diffVersionContent(getCollection(entry.collection).fields, versionContent(a), versionContent(b)) };
}

/** Options for reference pickers (entries of a collection, any status except deleted; published first). */
export async function listReferenceOptions(
  ctx: StaffContext,
  collection: CmsCollection,
  opts: { q?: string; locale?: string; limit?: number; ids?: string[] } = {},
): Promise<{ id: string; title: string; slug: string; status: CmsEntryStatus }[]> {
  assertView(ctx);
  const where: SQL[] = [eq(cmsEntries.collection, collection), isNull(cmsEntries.deletedAt), eq(cmsEntries.locale, opts.locale ?? "en")];
  if (opts.ids?.length) where.push(inArray(cmsEntries.id, opts.ids));
  else if (opts.q?.trim()) where.push(ilike(cmsEntries.title, likePattern(opts.q.trim())));
  return db
    .select({ id: cmsEntries.id, title: cmsEntries.title, slug: cmsEntries.slug, status: cmsEntries.status })
    .from(cmsEntries)
    .where(and(...where))
    .orderBy(sql`case ${cmsEntries.status} when 'published' then 0 when 'scheduled' then 1 when 'draft' then 2 else 3 end`, asc(cmsEntries.sortOrder), asc(cmsEntries.title))
    .limit(Math.min(Math.max(opts.limit ?? 25, 1), 100));
}

export type CollectionOverview = {
  collection: CmsCollection;
  label: string;
  singleton: boolean;
  total: number;
  published: number;
  drafts: number;
  scheduled: number;
  archived: number;
  withUnpublishedChanges: number;
  deleted: number;
};

/** Counts per collection for the content landing page. */
export async function listCollectionsOverview(ctx: StaffContext): Promise<CollectionOverview[]> {
  assertView(ctx);
  const rows = await db
    .select({
      collection: cmsEntries.collection,
      total: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is null)::int`,
      published: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is null and ${cmsEntries.status} = 'published')::int`,
      drafts: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is null and ${cmsEntries.status} = 'draft')::int`,
      scheduled: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is null and (${cmsEntries.status} = 'scheduled' or ${cmsEntries.scheduledVersion} is not null))::int`,
      archived: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is null and ${cmsEntries.status} = 'archived')::int`,
      withUnpublishedChanges: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is null and ${cmsEntries.status} = 'published' and ${cmsEntries.currentVersion} > ${cmsEntries.publishedVersion})::int`,
      deleted: sql<number>`count(*) filter (where ${cmsEntries.deletedAt} is not null)::int`,
    })
    .from(cmsEntries)
    .groupBy(cmsEntries.collection);
  const byCollection = new Map(rows.map((r) => [r.collection, r]));
  return CMS_COLLECTION_VALUES.map((collection) => {
    const r = byCollection.get(collection);
    const definition = getCollection(collection);
    return {
      collection,
      label: definition.label,
      singleton: definition.singleton,
      total: Number(r?.total ?? 0),
      published: Number(r?.published ?? 0),
      drafts: Number(r?.drafts ?? 0),
      scheduled: Number(r?.scheduled ?? 0),
      archived: Number(r?.archived ?? 0),
      withUnpublishedChanges: Number(r?.withUnpublishedChanges ?? 0),
      deleted: Number(r?.deleted ?? 0),
    };
  });
}

export type ScheduledContentItem = {
  id: string;
  collection: CmsCollection;
  title: string;
  action: "publish" | "unpublish";
  at: Date;
  version: number | null;
};

/** Upcoming scheduled publications and unpublications (content calendar), oldest first. */
export async function listScheduledContent(ctx: StaffContext, range: { from?: Date; to?: Date } = {}): Promise<ScheduledContentItem[]> {
  assertView(ctx);
  const from = range.from ?? new Date(Date.now() - 24 * 3600 * 1000);
  const to = range.to ?? new Date(Date.now() + 90 * 24 * 3600 * 1000);
  const base = isNull(cmsEntries.deletedAt);
  const [publishing, unpublishing] = await Promise.all([
    db
      .select({ id: cmsEntries.id, collection: cmsEntries.collection, title: cmsEntries.title, at: cmsEntries.publishAt, version: cmsEntries.scheduledVersion })
      .from(cmsEntries)
      .where(and(base, sql`${cmsEntries.scheduledVersion} is not null`, gte(cmsEntries.publishAt, from), lte(cmsEntries.publishAt, to))),
    db
      .select({ id: cmsEntries.id, collection: cmsEntries.collection, title: cmsEntries.title, at: cmsEntries.unpublishAt })
      .from(cmsEntries)
      .where(and(base, gte(cmsEntries.unpublishAt, from), lte(cmsEntries.unpublishAt, to))),
  ]);
  const items: ScheduledContentItem[] = [
    ...publishing.filter((r) => r.at).map((r) => ({ id: r.id, collection: r.collection, title: r.title, action: "publish" as const, at: r.at!, version: r.version })),
    ...unpublishing.filter((r) => r.at).map((r) => ({ id: r.id, collection: r.collection, title: r.title, action: "unpublish" as const, at: r.at!, version: null })),
  ];
  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Distinct tags used in a collection (filter chips / tag suggestions). */
export async function listEntryTags(ctx: StaffContext, collection: CmsCollection): Promise<string[]> {
  assertView(ctx);
  const rows = await db.execute<{ tag: string }>(
    sql`select distinct unnest(tags) as tag from cms_entries where collection = ${collection} and deleted_at is null order by 1 limit 500`,
  );
  return rows.rows.map((r) => r.tag);
}
