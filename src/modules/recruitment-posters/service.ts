import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { cmsEntries, countries, files, mediaAssets, type CmsEntryStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { logger } from "@/lib/logger";
import { createEntry, createMediaAsset, publishEntry, requestPublication, restoreEntry, setMediaVisibility } from "@/modules/content/service";
import type { PublishOutcome } from "@/modules/content/types";
import { fileUrl, getFile, requireUploadedFile, storeFile, type FileRow } from "@/modules/files";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

import { parseLines, parseTradeLines, type QuickPosterInput } from "./schemas";

/**
 * Requirement posters: one-step publishing from a phone (upload → media library → CMS entry → publish) and the
 * staff list. Everything goes through the content and files services, so their rules apply unchanged: the image
 * is a `cms_media` file, the media item is public only after the "no identifiable people" answer and a text
 * alternative, and publication needs content.publish (otherwise the entry is sent to the approval centre).
 *
 * Permissions: content.edit + media.manage to post; content.publish to publish directly.
 */

export const POSTER_COLLECTION = "requirement_posts" as const;
export const POSTER_PERMISSIONS = ["content.edit", "media.manage"] as const;
export const POSTERS_ADMIN_PATH = "/admin/requirements/posters";

function assertCanPost(ctx: StaffContext): void {
  if (!staffCan(ctx, [...POSTER_PERMISSIONS])) throw new ActionError("You need the content editing and media library permissions to post requirements.", { code: "forbidden" });
}

export function defaultPosterTitle(now: Date = new Date()): string {
  return `New requirement - ${formatDate(now, { timeZone: env().DEFAULT_TIMEZONE })}`;
}

/**
 * Store an image shared to the installed app (Web Share Target) as a private `cms_media` draft upload owned by
 * the staff member, with the shared text kept in the file metadata for the "new" page to prefill.
 */
export async function storeSharedPoster(ctx: StaffContext, upload: { data: Uint8Array; name: string; type: string | null }, shared: { title?: string; text?: string }): Promise<FileRow> {
  assertCanPost(ctx);
  return storeFile({
    data: upload.data,
    originalName: upload.name || "poster.jpg",
    declaredMimeType: upload.type,
    purpose: "cms_media",
    ownerUserId: ctx.user.id,
    visibility: "private",
    metadata: {
      source: "share_target",
      ...(shared.title?.trim() ? { sharedTitle: shared.title.trim().slice(0, 200) } : {}),
      ...(shared.text?.trim() ? { sharedText: shared.text.trim().slice(0, 2000) } : {}),
    },
  });
}

export type DraftPosterUpload = { id: string; previewUrl: string; name: string; sharedTitle: string | null; sharedText: string | null };

/** A cms_media upload of this staff member that has not been used yet (prefill for the "new" page), else null. */
export async function getDraftPosterUpload(ctx: StaffContext, fileId: string): Promise<DraftPosterUpload | null> {
  assertCanPost(ctx);
  const file = await getFile(fileId);
  if (!file || file.purpose !== "cms_media" || file.ownerUserId !== ctx.user.id || file.scanStatus === "infected") return null;
  if (!file.mimeType.startsWith("image/")) return null;
  const meta = (file.metadata ?? {}) as Record<string, unknown>;
  return {
    id: file.id,
    previewUrl: fileUrl(file, file.variants?.md ? { variant: "md" } : {}),
    name: file.originalName,
    sharedTitle: typeof meta.sharedTitle === "string" ? meta.sharedTitle : null,
    sharedText: typeof meta.sharedText === "string" ? meta.sharedText : null,
  };
}

export type QuickPosterResult = { entryId: string; slug: string; outcome: PublishOutcome | null; publishError: string | null };

/** The media item already created for this file (a retried "Publish now"), so the upload is never duplicated. */
async function existingAssetFor(fileId: string): Promise<{ id: string; visibility: "public" | "internal" } | null> {
  const [row] = await db
    .select({ id: mediaAssets.id, visibility: mediaAssets.visibility })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.fileId, fileId), isNull(mediaAssets.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Upload already done (fileId) → public media item → requirement_posts entry → publish (or request approval
 * without content.publish). The entry is kept as a draft when publication fails, and the reason is returned.
 */
export async function quickPublishPoster(ctx: StaffContext, input: QuickPosterInput): Promise<QuickPosterResult> {
  assertCanPost(ctx);
  // Only the poster this staff member uploaded or shared (never another person's file id).
  await requireUploadedFile(input.fileId, { purposes: ["cms_media"], ownerUserId: ctx.user.id });

  let countryName: string | null = null;
  if (input.countryCode) {
    const [country] = await db.select({ name: countries.name }).from(countries).where(eq(countries.code, input.countryCode)).limit(1);
    if (!country) throw new ActionError("Choose a country from the list.", { fieldErrors: { countryCode: ["Choose a country from the list"] } });
    countryName = country.name;
  }

  const title = input.title?.trim() || defaultPosterTitle();
  const altText = `Recruitment poster: ${title}${countryName ? `, ${countryName}` : ""}`.slice(0, 300);

  const existing = await existingAssetFor(input.fileId);
  let assetId: string;
  if (existing) {
    assetId = existing.id;
    if (existing.visibility !== "public") await setMediaVisibility(ctx, assetId, "public");
  } else {
    const media = await createMediaAsset(ctx, {
      fileId: input.fileId,
      title,
      altText,
      decorative: false,
      tags: ["requirement-poster"],
      // Recruitment posters are text and logos; posters showing identifiable people go through the media library.
      showsIdentifiablePeople: false,
      visibility: "public",
    });
    assetId = media.id;
  }

  const trades = parseTradeLines(input.trades);
  const benefits = parseLines(input.benefits, 20, 160);
  const data: Record<string, unknown> = { posterAssetId: assetId };
  if (input.countryCode) data.countryCode = input.countryCode;
  if (input.companyName) data.companyName = input.companyName;
  if (trades.length) data.trades = trades;
  if (benefits.length) data.benefits = benefits;
  if (input.description) data.description = input.description;
  if (input.applyBy) data.applyBy = input.applyBy;

  const entry = await createEntry(ctx, {
    collection: POSTER_COLLECTION,
    locale: "en",
    title,
    data,
    seo: {},
    tags: [],
    note: "Posted from the phone page",
  });

  try {
    const outcome = staffCan(ctx, "content.publish") ? await publishEntry(ctx, { id: entry.id }) : await requestPublication(ctx, { id: entry.id });
    return { entryId: entry.id, slug: entry.slug, outcome, publishError: null };
  } catch (error) {
    if (error instanceof ActionError) return { entryId: entry.id, slug: entry.slug, outcome: null, publishError: error.message };
    logger.error("Poster publication failed", { error, entryId: entry.id });
    return { entryId: entry.id, slug: entry.slug, outcome: null, publishError: "The poster was saved as a draft but could not be published. Open it in the content editor." };
  }
}

/** Unarchive: back to draft, then publish again (or request approval). */
export async function restoreAndPublishPoster(ctx: StaffContext, entryId: string): Promise<PublishOutcome> {
  assertCanPost(ctx);
  await assertPoster(entryId);
  await restoreEntry(ctx, entryId);
  return staffCan(ctx, "content.publish") ? publishEntry(ctx, { id: entryId }) : requestPublication(ctx, { id: entryId });
}

export async function assertPoster(entryId: string): Promise<void> {
  const [row] = await db
    .select({ id: cmsEntries.id })
    .from(cmsEntries)
    .where(and(eq(cmsEntries.id, entryId), eq(cmsEntries.collection, POSTER_COLLECTION), isNull(cmsEntries.deletedAt)))
    .limit(1);
  if (!row) throw new ActionError("This requirement poster could not be found.");
}

export type PosterListItem = {
  id: string;
  slug: string;
  title: string;
  status: CmsEntryStatus;
  countryCode: string | null;
  countryName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  thumbnailUrl: string | null;
  publicPath: string;
};

/** Staff list of posters (not deleted), newest first, with a thumbnail of the poster image. */
export async function listPosters(ctx: StaffContext, opts: { status?: CmsEntryStatus }, page: PageQuery): Promise<Paginated<PosterListItem>> {
  if (!staffCan(ctx, "content.view")) throw new ActionError("You do not have permission to do this.", { code: "forbidden" });
  const where = and(eq(cmsEntries.collection, POSTER_COLLECTION), isNull(cmsEntries.deletedAt), opts.status ? eq(cmsEntries.status, opts.status) : undefined);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: cmsEntries.id,
        slug: cmsEntries.slug,
        title: cmsEntries.title,
        status: cmsEntries.status,
        publishedAt: cmsEntries.publishedAt,
        createdAt: cmsEntries.createdAt,
        countryCode: sql<string | null>`${cmsEntries.data}->>'countryCode'`,
        posterAssetId: sql<string | null>`${cmsEntries.data}->>'posterAssetId'`,
      })
      .from(cmsEntries)
      .where(where)
      .orderBy(desc(cmsEntries.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(cmsEntries).where(where),
  ]);

  const assetIds = rows.map((r) => r.posterAssetId).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
  const codes = [...new Set(rows.map((r) => r.countryCode).filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)))];
  const [assets, countryRows] = await Promise.all([
    assetIds.length
      ? db.select({ id: mediaAssets.id, file: files }).from(mediaAssets).innerJoin(files, eq(files.id, mediaAssets.fileId)).where(inArray(mediaAssets.id, assetIds))
      : Promise.resolve([]),
    codes.length ? db.select({ code: countries.code, name: countries.name }).from(countries).where(inArray(countries.code, codes)) : Promise.resolve([]),
  ]);
  const thumbs = new Map(assets.map((a) => [a.id, a.file.deletedAt ? null : fileUrl(a.file, a.file.variants?.thumb ? { variant: "thumb" } : {})]));
  const names = new Map(countryRows.map((c) => [c.code, c.name]));

  return paginated(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      countryCode: r.countryCode,
      countryName: r.countryCode ? (names.get(r.countryCode) ?? r.countryCode) : null,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      thumbnailUrl: r.posterAssetId ? (thumbs.get(r.posterAssetId) ?? null) : null,
      publicPath: `/requirements/${r.slug}`,
    })),
    totals[0]?.value ?? 0,
    page,
  );
}
