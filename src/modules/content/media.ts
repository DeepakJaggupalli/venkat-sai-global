import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { approvalRequests, cmsEntries, files, logoPermissions, mediaAssets, mediaFolders, mediaUsages, users } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { cancelApprovalsForEntity, submitForApproval } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { fileUrl, requireUploadedFile, setFileVisibility, softDeleteFile, type FileRow } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";

import { CMS_COLLECTION_LABELS } from "./constants";
import { parseVideoEmbedUrl } from "./embeds";
import type { AssetRef } from "./field-walk";
import { assertStaff, dateFromCalendar, likePattern, rethrowConstraint } from "./internal";
import { CONTENT_ADMIN_PATHS } from "./links";
import type {
  CreateEmbedAssetInput,
  CreateMediaAssetInput,
  MediaConsentInput,
  MediaListFilters,
  UpdateMediaAssetInput,
} from "./schemas";
import type { AssetMap, MediaAssetRow, MediaFolderRow, MediaListItem, MediaUsageItem, PublicMediaAsset } from "./types";

/**
 * Media library: assets (uploaded files or YouTube/Vimeo embeds), folders, usage tracking and public URLs.
 *
 * Consent model (privacy by default): an asset is `internal` until made public. Public use requires a people
 * assessment; assets showing identifiable people additionally need consent `obtained` (with evidence) and a
 * second check through the approval centre (approval type `media_asset`). Withdrawing or losing consent makes
 * the asset internal and its file private at once, so it disappears from every page that references it
 * (public queries only resolve public assets); the editors of those pages are told via the usage list.
 * The underlying files are uploaded with purpose `cms_media`; evidence files (signed releases) are forced private.
 */

type Tx = DbOrTx;

const EVIDENCE_PURPOSES = ["cms_media", "other"] as const;

// ---------------------------------------------------------------------------
// URLs and public resolution
// ---------------------------------------------------------------------------

type UrlFile = Pick<FileRow, "id" | "visibility" | "originalName" | "mimeType" | "variants">;

/**
 * URL of a media asset: the file URL (optionally an image variant) via the files module, or the player URL
 * of an embed. Null when the asset has no usable source.
 */
export function mediaUrl(
  asset: Pick<MediaAssetRow, "kind" | "embedUrl"> & { file?: UrlFile | null },
  variant?: "thumb" | "md" | "lg",
): string | null {
  if (asset.kind === "embed") return asset.embedUrl;
  if (!asset.file) return null;
  return fileUrl(asset.file, variant ? { variant } : {});
}

function toPublicAsset(asset: MediaAssetRow, file: FileRow | null): PublicMediaAsset {
  const variants: PublicMediaAsset["variants"] = {};
  if (file) {
    for (const name of ["thumb", "md", "lg"] as const) {
      if (file.variants?.[name]) variants[name] = fileUrl(file, { variant: name });
    }
  }
  return {
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    alt: asset.altText,
    caption: asset.caption,
    credit: asset.credit,
    url: mediaUrl({ kind: asset.kind, embedUrl: asset.embedUrl, file }) ?? "",
    thumbnailUrl: variants.thumb ?? (asset.kind === "image" && file ? fileUrl(file) : null),
    variants,
    width: file?.width ?? null,
    height: file?.height ?? null,
    mimeType: file?.mimeType ?? null,
    embedProvider: asset.embedProvider,
    embedUrl: asset.embedUrl,
  };
}

/**
 * Public media for the given ids: only assets that are public, active and not deleted, whose file (if any) is
 * public, not deleted and not quarantined. Anything else is silently left out (pages render without it).
 */
export async function resolvePublicAssets(ids: Iterable<string>, tx: Tx = db): Promise<AssetMap> {
  const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!unique.length) return {};
  const rows = await tx
    .select({ asset: mediaAssets, file: files })
    .from(mediaAssets)
    .leftJoin(files, eq(files.id, mediaAssets.fileId))
    .where(
      and(
        inArray(mediaAssets.id, unique),
        eq(mediaAssets.visibility, "public"),
        eq(mediaAssets.status, "active"),
        isNull(mediaAssets.deletedAt),
        sql`(${mediaAssets.kind} = 'embed' or (${files.id} is not null and ${files.visibility} = 'public' and ${files.deletedAt} is null and ${files.scanStatus} <> 'infected'))`,
      ),
    );
  const out: AssetMap = {};
  for (const row of rows) out[row.asset.id] = toPublicAsset(row.asset, row.file);
  return out;
}

// ---------------------------------------------------------------------------
// Validation and usage tracking (used by every content service)
// ---------------------------------------------------------------------------

export type AssetRequirement = { assetId: string; kinds?: readonly string[]; label?: string };

/**
 * Check that referenced assets exist, are not deleted or archived, and are of an allowed kind.
 * Throws an ActionError naming the problem (fieldErrors keyed by `fieldKey` when given).
 */
export async function assertAssetsUsable(requirements: AssetRequirement[], tx: Tx = db, fieldKey = "_form"): Promise<void> {
  if (!requirements.length) return;
  const ids = [...new Set(requirements.map((r) => r.assetId))];
  const rows = await tx
    .select({ id: mediaAssets.id, title: mediaAssets.title, kind: mediaAssets.kind, status: mediaAssets.status, deletedAt: mediaAssets.deletedAt })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];
  for (const req of requirements) {
    const asset = byId.get(req.assetId);
    const where = req.label ? ` (${req.label})` : "";
    if (!asset || asset.deletedAt) problems.push(`A selected media item no longer exists${where}.`);
    else if (asset.status !== "active") problems.push(`"${asset.title}" is archived${where}. Restore it or choose another item.`);
    else if (req.kinds?.length && !req.kinds.includes(asset.kind)) problems.push(`"${asset.title}" is not an allowed type here${where}.`);
  }
  if (problems.length) throw new ActionError([...new Set(problems)].join(" "), { fieldErrors: { [fieldKey]: [...new Set(problems)] } });
}

/** Referenced assets that are not public (cannot appear on the live site). */
export async function findNonPublicAssets(ids: string[], tx: Tx = db): Promise<{ id: string; title: string }[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  return tx
    .select({ id: mediaAssets.id, title: mediaAssets.title })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, unique), sql`(${mediaAssets.visibility} <> 'public' or ${mediaAssets.status} <> 'active' or ${mediaAssets.deletedAt} is not null)`));
}

/**
 * Replace the usage rows of one entity with `refs` (idempotent). Other modules that embed media assets
 * (courses, organisation pages…) call this with their own entityType so deletion guards see their usage.
 */
export async function syncMediaUsages(entityType: string, entityId: string, refs: AssetRef[], tx: Tx = db): Promise<void> {
  const wanted = new Map<string, AssetRef>();
  for (const ref of refs) wanted.set(`${ref.assetId}|${ref.field}`, ref);
  const existing = await tx
    .select({ id: mediaUsages.id, assetId: mediaUsages.assetId, field: mediaUsages.field })
    .from(mediaUsages)
    .where(and(eq(mediaUsages.entityType, entityType), eq(mediaUsages.entityId, entityId)));
  const stale = existing.filter((row) => !wanted.has(`${row.assetId}|${row.field}`)).map((row) => row.id);
  if (stale.length) await tx.delete(mediaUsages).where(inArray(mediaUsages.id, stale));
  const have = new Set(existing.map((row) => `${row.assetId}|${row.field}`));
  const missing = [...wanted.values()].filter((ref) => !have.has(`${ref.assetId}|${ref.field}`));
  if (!missing.length) return;
  // Only existing assets can be recorded (FK); unknown ids were rejected by validation already.
  const present = await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.id, [...new Set(missing.map((m) => m.assetId))]));
  const presentIds = new Set(present.map((p) => p.id));
  const values = missing.filter((m) => presentIds.has(m.assetId)).map((m) => ({ assetId: m.assetId, entityType, entityId, field: m.field }));
  if (values.length) await tx.insert(mediaUsages).values(values).onConflictDoNothing({ target: [mediaUsages.assetId, mediaUsages.entityType, mediaUsages.entityId, mediaUsages.field] });
}

export async function clearMediaUsages(entityType: string, entityId: string, tx: Tx = db): Promise<void> {
  await tx.delete(mediaUsages).where(and(eq(mediaUsages.entityType, entityType), eq(mediaUsages.entityId, entityId)));
}

async function usageCount(assetId: string, tx: Tx): Promise<number> {
  const [row] = await tx.select({ value: count() }).from(mediaUsages).where(eq(mediaUsages.assetId, assetId));
  return row?.value ?? 0;
}

/** Where an asset is used, with labels and admin links for known entity types. */
export async function listAssetUsages(assetId: string, tx: Tx = db): Promise<MediaUsageItem[]> {
  const rows = await tx.select().from(mediaUsages).where(eq(mediaUsages.assetId, assetId)).orderBy(asc(mediaUsages.entityType), asc(mediaUsages.createdAt));
  const entryIds = rows.filter((r) => r.entityType === "cms_entry").map((r) => r.entityId);
  const logoIds = rows.filter((r) => r.entityType === "logo_permission").map((r) => r.entityId);
  // Sequential: `tx` may be a transaction client, which must not run queries concurrently.
  const entries = entryIds.length
    ? await tx.select({ id: cmsEntries.id, title: cmsEntries.title, collection: cmsEntries.collection }).from(cmsEntries).where(inArray(cmsEntries.id, entryIds))
    : [];
  const logos = logoIds.length
    ? await tx.select({ id: logoPermissions.id, name: logoPermissions.organizationName }).from(logoPermissions).where(inArray(logoPermissions.id, logoIds))
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const logoById = new Map(logos.map((l) => [l.id, l]));
  return rows.map((row) => {
    if (row.entityType === "cms_entry") {
      const entry = entryById.get(row.entityId);
      return {
        entityType: row.entityType,
        entityId: row.entityId,
        field: row.field,
        label: entry ? `${CMS_COLLECTION_LABELS[entry.collection]}: ${entry.title}` : "Content entry",
        href: entry ? CONTENT_ADMIN_PATHS.entry(entry.collection, entry.id) : null,
      };
    }
    if (row.entityType === "logo_permission") {
      const logo = logoById.get(row.entityId);
      return { entityType: row.entityType, entityId: row.entityId, field: row.field, label: `Logo permission: ${logo?.name ?? "unknown"}`, href: CONTENT_ADMIN_PATHS.logoPermission(row.entityId) };
    }
    return { entityType: row.entityType, entityId: row.entityId, field: row.field, label: `${row.entityType.replace(/_/g, " ")} ${row.entityId.slice(0, 8)}`, href: null };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function lockAsset(id: string, tx: Tx): Promise<MediaAssetRow> {
  const locked = await tx.execute<{ id: string }>(sql`select id from media_assets where id = ${id} and deleted_at is null for update`);
  if (!locked.rows.length) throw new ActionError("This media item could not be found.");
  const [asset] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) throw new ActionError("This media item could not be found.");
  return asset;
}

async function assertFolder(folderId: string | undefined | null, tx: Tx): Promise<void> {
  if (!folderId) return;
  const [folder] = await tx.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.id, folderId)).limit(1);
  if (!folder) throw new ActionError("That folder no longer exists.", { fieldErrors: { folderId: ["Choose another folder"] } });
}

function kindForMime(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

/** Evidence files (signed releases, permission letters) must exist, be of an evidence purpose, and be private. */
export async function prepareEvidenceFile(fileId: string | undefined | null, actorUserId: string, tx: Tx): Promise<string | null> {
  if (!fileId) return null;
  const file = await requireUploadedFile(fileId, { purposes: [...EVIDENCE_PURPOSES] }, tx);
  if (file.visibility !== "private") await setFileVisibility(file.id, "private", { actorUserId, tx });
  return file.id;
}

async function syncFileVisibility(asset: Pick<MediaAssetRow, "fileId" | "visibility">, actorUserId: string, tx: Tx): Promise<void> {
  if (!asset.fileId) return;
  await setFileVisibility(asset.fileId, asset.visibility === "public" ? "public" : "private", { actorUserId, tx });
}

function publicReadinessProblem(asset: Pick<MediaAssetRow, "kind" | "altText" | "showsIdentifiablePeople" | "consentStatus" | "consentExpiresAt" | "status">, now: Date): string | null {
  if (asset.status !== "active") return "Restore this media item before making it public.";
  if (asset.showsIdentifiablePeople === null) return "Answer whether identifiable people appear in this item before making it public.";
  if (asset.kind === "image" && asset.altText === null) return "Add a text alternative (or mark the image as decorative) before making it public.";
  if (asset.showsIdentifiablePeople) {
    if (asset.consentStatus !== "obtained") return "Record the consent of the people shown (with evidence) before making this item public.";
    if (asset.consentExpiresAt && asset.consentExpiresAt.getTime() <= now.getTime()) return "The recorded consent has expired. Record a new consent first.";
  } else if (asset.consentStatus !== "not_required" && asset.consentStatus !== "obtained") {
    return "This item's consent is pending or withdrawn. Resolve it before making the item public.";
  }
  return null;
}

/** Make an asset public now (approval handler and direct path). Validates readiness again. */
export async function applyMediaPublic(assetId: string, actorUserId: string, tx: Tx): Promise<void> {
  const asset = await lockAsset(assetId, tx);
  const problem = publicReadinessProblem(asset, new Date());
  if (problem) throw new ActionError(problem);
  if (asset.visibility !== "public") {
    await tx.update(mediaAssets).set({ visibility: "public" }).where(eq(mediaAssets.id, assetId));
  }
  await syncFileVisibility({ fileId: asset.fileId, visibility: "public" }, actorUserId, tx);
  await audit({ action: "media.made_public", entityType: "media_asset", entityId: assetId, actorUserId, tx });
}

/** Withdraw public use (consent withdrawn / expired / pending): internal + private file. Returns where it was used. */
async function withdrawPublicUse(asset: MediaAssetRow, actorUserId: string | null, reason: string, tx: Tx): Promise<MediaUsageItem[]> {
  if (asset.visibility === "public") {
    await tx.update(mediaAssets).set({ visibility: "internal" }).where(eq(mediaAssets.id, asset.id));
  }
  if (asset.fileId) await setFileVisibility(asset.fileId, "private", { actorUserId, tx });
  await cancelApprovalsForEntity("media_asset", asset.id, actorUserId, reason, tx);
  return listAssetUsages(asset.id, tx);
}

// ---------------------------------------------------------------------------
// Staff services (media.manage)
// ---------------------------------------------------------------------------

export type MediaWriteResult = {
  id: string;
  visibility: "public" | "internal";
  /** Set when public use was sent to the approval centre (items showing people). */
  approval: { id: string; code: string } | null;
  /** Public use was asked for an item showing people: record their consent, then request public use. */
  needsConsent: boolean;
};

async function requestPublicApproval(asset: MediaAssetRow, ctx: StaffContext, tx: Tx): Promise<{ id: string; code: string }> {
  const request = await submitForApproval(
    {
      type: "media_asset",
      entityType: "media_asset",
      entityId: asset.id,
      title: `Public use of media: ${asset.title}`,
      summary: "Shows identifiable people. Check the recorded consent and evidence before approving.",
      payload: { assetId: asset.id, consentStatus: asset.consentStatus, consentExpiresAt: asset.consentExpiresAt?.toISOString() ?? null },
      submittedByUserId: ctx.user.id,
    },
    tx,
  );
  await audit({ action: "media.public_use_requested", entityType: "media_asset", entityId: asset.id, actorUserId: ctx.user.id, metadata: { approvalId: request.id }, tx });
  return { id: request.id, code: request.code };
}

/** Add an uploaded file (purpose cms_media) to the media library. */
export async function createMediaAsset(ctx: StaffContext, input: CreateMediaAssetInput): Promise<MediaWriteResult> {
  assertStaff(ctx, "media.manage");
  try {
    return await db.transaction(async (tx) => {
      const file = await requireUploadedFile(input.fileId, { purposes: ["cms_media"] }, tx);
      await assertFolder(input.folderId, tx);
      const kind = kindForMime(file.mimeType);
      const altText = input.decorative ? "" : (input.altText ?? null);
      const [asset] = await tx
        .insert(mediaAssets)
        .values({
          kind,
          fileId: file.id,
          folderId: input.folderId ?? null,
          title: input.title,
          altText,
          caption: input.caption ?? null,
          description: input.description ?? null,
          credit: input.credit ?? null,
          tags: input.tags,
          showsIdentifiablePeople: input.showsIdentifiablePeople ?? null,
          consentStatus: input.showsIdentifiablePeople ? "pending" : "not_required",
          visibility: "internal",
          uploadedByUserId: ctx.user.id,
        })
        .returning();
      await audit({ action: "media.asset_created", entityType: "media_asset", entityId: asset!.id, actorUserId: ctx.user.id, metadata: { kind, fileId: file.id }, tx });
      return finishVisibilityRequest(asset!, input.visibility, ctx, tx);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Add a YouTube / Vimeo video by link (normalised to the provider's player URL). */
export async function createEmbedAsset(ctx: StaffContext, input: CreateEmbedAssetInput): Promise<MediaWriteResult> {
  assertStaff(ctx, "media.manage");
  const embed = parseVideoEmbedUrl(input.url);
  if (!embed) throw new ActionError("Enter a YouTube or Vimeo video link.", { fieldErrors: { url: ["Enter a YouTube or Vimeo video link"] } });
  try {
    return await db.transaction(async (tx) => {
      await assertFolder(input.folderId, tx);
      const [asset] = await tx
        .insert(mediaAssets)
        .values({
          kind: "embed",
          embedProvider: embed.provider,
          embedUrl: embed.embedUrl,
          folderId: input.folderId ?? null,
          title: input.title,
          altText: input.altText ?? null,
          caption: input.caption ?? null,
          description: input.description ?? null,
          credit: input.credit ?? null,
          tags: input.tags,
          showsIdentifiablePeople: input.showsIdentifiablePeople ?? null,
          consentStatus: input.showsIdentifiablePeople ? "pending" : "not_required",
          visibility: "internal",
          uploadedByUserId: ctx.user.id,
        })
        .returning();
      await audit({ action: "media.asset_created", entityType: "media_asset", entityId: asset!.id, actorUserId: ctx.user.id, metadata: { kind: "embed", provider: embed.provider }, tx });
      return finishVisibilityRequest(asset!, input.visibility, ctx, tx);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/**
 * After creating an asset: items showing people always start internal (their consent is recorded next, then
 * public use is requested); other items become public at once when asked and ready.
 */
async function finishVisibilityRequest(asset: MediaAssetRow, visibility: "public" | "internal", ctx: StaffContext, tx: Tx): Promise<MediaWriteResult> {
  if (visibility === "public" && !asset.showsIdentifiablePeople) {
    const problem = publicReadinessProblem(asset, new Date());
    if (problem) throw new ActionError(problem);
    await applyMediaPublic(asset.id, ctx.user.id, tx);
    return { id: asset.id, visibility: "public", approval: null, needsConsent: false };
  }
  await syncFileVisibility({ fileId: asset.fileId, visibility: "internal" }, ctx.user.id, tx);
  return { id: asset.id, visibility: "internal", approval: null, needsConsent: visibility === "public" && asset.showsIdentifiablePeople === true };
}

/**
 * Update descriptive fields (title, alt text, caption, credit, tags, folder, people assessment). Answering
 * "people shown" on a public item makes it internal until consent is recorded and public use is approved.
 */
export async function updateMediaAsset(ctx: StaffContext, input: UpdateMediaAssetInput): Promise<{ visibility: "public" | "internal"; madeInternal: boolean }> {
  assertStaff(ctx, "media.manage");
  try {
    return await db.transaction(async (tx) => {
      const asset = await lockAsset(input.id, tx);
      await assertFolder(input.folderId, tx);
      const altText = input.decorative ? "" : (input.altText ?? null);
      const people = input.showsIdentifiablePeople ?? null;
      const becamePeople = people === true && asset.showsIdentifiablePeople !== true;
      let consentStatus = asset.consentStatus;
      if (people === true && consentStatus === "not_required") consentStatus = "pending";
      let visibility = asset.visibility;
      let madeInternal = false;
      if (visibility === "public" && (becamePeople || people === null || (asset.kind === "image" && altText === null))) {
        visibility = "internal";
        madeInternal = true;
      }
      await tx
        .update(mediaAssets)
        .set({
          title: input.title,
          altText,
          caption: input.caption ?? null,
          description: input.description ?? null,
          credit: input.credit ?? null,
          tags: input.tags,
          folderId: input.folderId ?? null,
          showsIdentifiablePeople: people,
          consentStatus,
          visibility,
        })
        .where(eq(mediaAssets.id, asset.id));
      if (madeInternal) {
        await withdrawPublicUse({ ...asset, visibility: "public" }, ctx.user.id, "People assessment or text alternative changed", tx);
      }
      await audit({ action: "media.asset_updated", entityType: "media_asset", entityId: asset.id, actorUserId: ctx.user.id, metadata: { madeInternal }, tx });
      return { visibility, madeInternal };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/**
 * Record consent evidence of the people shown. Any status other than obtained / not required takes the item
 * out of public use immediately (internal + private file); the returned usages tell editors what changed.
 */
export async function updateMediaConsent(
  ctx: StaffContext,
  input: MediaConsentInput,
): Promise<{ visibility: "public" | "internal"; withdrawnFromPublicUse: boolean; affectedUsages: MediaUsageItem[] }> {
  assertStaff(ctx, "media.manage");
  try {
    return await db.transaction(async (tx) => {
      const asset = await lockAsset(input.id, tx);
      const consentFileId = input.consentFileId !== undefined ? await prepareEvidenceFile(input.consentFileId, ctx.user.id, tx) : asset.consentFileId;
      const obtainedAt = input.consentObtainedAt ? dateFromCalendar(input.consentObtainedAt) : input.consentStatus === "obtained" ? asset.consentObtainedAt : null;
      const expiresAt = dateFromCalendar(input.consentExpiresAt);
      if (input.consentStatus === "obtained") {
        if (!obtainedAt) throw new ActionError("Enter the date consent was obtained.", { fieldErrors: { consentObtainedAt: ["Required when consent is obtained"] } });
        if (!consentFileId && !input.consentNotes?.trim()) {
          throw new ActionError("Upload the signed release or note where the evidence is kept.", { fieldErrors: { consentNotes: ["Evidence is required"] } });
        }
      }
      if (asset.showsIdentifiablePeople && input.consentStatus === "not_required") {
        throw new ActionError("This item shows identifiable people, so consent is required.", { fieldErrors: { consentStatus: ["Consent is required"] } });
      }
      const loses = asset.visibility === "public" && input.consentStatus !== "obtained" && input.consentStatus !== "not_required";
      const expired = asset.visibility === "public" && expiresAt !== null && expiresAt.getTime() <= Date.now();
      const withdraw = loses || expired;
      await tx
        .update(mediaAssets)
        .set({
          consentStatus: input.consentStatus,
          consentNotes: input.consentNotes ?? null,
          consentFileId,
          consentObtainedAt: obtainedAt,
          consentExpiresAt: expiresAt,
          visibility: withdraw ? "internal" : asset.visibility,
        })
        .where(eq(mediaAssets.id, asset.id));
      const affectedUsages = withdraw ? await withdrawPublicUse(asset, ctx.user.id, `Consent ${input.consentStatus}`, tx) : [];
      await audit({
        action: input.consentStatus === "withdrawn" ? "media.consent_withdrawn" : "media.consent_updated",
        entityType: "media_asset",
        entityId: asset.id,
        actorUserId: ctx.user.id,
        metadata: { from: asset.consentStatus, to: input.consentStatus, withdrawnFromPublicUse: withdraw, usages: affectedUsages.length },
        tx,
      });
      return { visibility: withdraw ? "internal" : asset.visibility, withdrawnFromPublicUse: withdraw, affectedUsages };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/**
 * Make an asset internal (immediately) or public. Public use of an item showing identifiable people goes to
 * the approval centre (type media_asset); other items become public at once once they meet the rules.
 */
export async function setMediaVisibility(ctx: StaffContext, assetId: string, visibility: "public" | "internal"): Promise<MediaWriteResult> {
  assertStaff(ctx, "media.manage");
  try {
    return await db.transaction(async (tx) => {
      const asset = await lockAsset(assetId, tx);
      if (visibility === "internal") {
        if (asset.visibility !== "internal") await tx.update(mediaAssets).set({ visibility: "internal" }).where(eq(mediaAssets.id, asset.id));
        await syncFileVisibility({ fileId: asset.fileId, visibility: "internal" }, ctx.user.id, tx);
        await cancelApprovalsForEntity("media_asset", asset.id, ctx.user.id, "Made internal", tx);
        await audit({ action: "media.made_internal", entityType: "media_asset", entityId: asset.id, actorUserId: ctx.user.id, tx });
        return { id: asset.id, visibility: "internal", approval: null, needsConsent: false };
      }
      if (asset.visibility === "public") return { id: asset.id, visibility: "public", approval: null, needsConsent: false };
      const problem = publicReadinessProblem(asset, new Date());
      if (problem) throw new ActionError(problem);
      if (asset.showsIdentifiablePeople) {
        return { id: asset.id, visibility: "internal", approval: await requestPublicApproval(asset, ctx, tx), needsConsent: false };
      }
      await applyMediaPublic(asset.id, ctx.user.id, tx);
      return { id: asset.id, visibility: "public", approval: null, needsConsent: false };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

function usageBlockMessage(usages: MediaUsageItem[], action: string): string {
  const names = usages.slice(0, 3).map((u) => u.label);
  const more = usages.length > 3 ? ` and ${usages.length - 3} more` : "";
  return `This media item is still used (${names.join("; ")}${more}). Remove it from those places before you ${action} it.`;
}

/** Archive an unused asset (it becomes internal; its file private). */
export async function archiveMediaAsset(ctx: StaffContext, assetId: string): Promise<void> {
  assertStaff(ctx, "media.manage");
  await db.transaction(async (tx) => {
    const asset = await lockAsset(assetId, tx);
    if ((await usageCount(asset.id, tx)) > 0) throw new ActionError(usageBlockMessage(await listAssetUsages(asset.id, tx), "archive"));
    await tx.update(mediaAssets).set({ status: "archived", visibility: "internal" }).where(eq(mediaAssets.id, asset.id));
    await syncFileVisibility({ fileId: asset.fileId, visibility: "internal" }, ctx.user.id, tx);
    await cancelApprovalsForEntity("media_asset", asset.id, ctx.user.id, "Archived", tx);
    await audit({ action: "media.asset_archived", entityType: "media_asset", entityId: asset.id, actorUserId: ctx.user.id, tx });
  });
}

/** Restore an archived asset (stays internal until made public again). */
export async function restoreMediaAsset(ctx: StaffContext, assetId: string): Promise<void> {
  assertStaff(ctx, "media.manage");
  await db.transaction(async (tx) => {
    const asset = await lockAsset(assetId, tx);
    if (asset.status === "active") return;
    await tx.update(mediaAssets).set({ status: "active" }).where(eq(mediaAssets.id, asset.id));
    await audit({ action: "media.asset_restored", entityType: "media_asset", entityId: asset.id, actorUserId: ctx.user.id, tx });
  });
}

/** Delete an unused asset: soft-deletes the row and its file (bytes purged later). Consent evidence files are kept. */
export async function deleteMediaAsset(ctx: StaffContext, assetId: string): Promise<void> {
  assertStaff(ctx, "media.manage");
  await db.transaction(async (tx) => {
    const asset = await lockAsset(assetId, tx);
    if ((await usageCount(asset.id, tx)) > 0) throw new ActionError(usageBlockMessage(await listAssetUsages(asset.id, tx), "delete"));
    await tx.update(mediaAssets).set({ deletedAt: new Date(), status: "archived", visibility: "internal" }).where(eq(mediaAssets.id, asset.id));
    if (asset.fileId) await softDeleteFile(asset.fileId, { actorUserId: ctx.user.id, reason: "Media library item deleted", tx });
    await cancelApprovalsForEntity("media_asset", asset.id, ctx.user.id, "Deleted", tx);
    await audit({ action: "media.asset_deleted", entityType: "media_asset", entityId: asset.id, actorUserId: ctx.user.id, metadata: { title: asset.title }, tx });
  });
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createMediaFolder(ctx: StaffContext, input: { name: string; parentId?: string }): Promise<{ id: string }> {
  assertStaff(ctx, "media.manage");
  try {
    return await db.transaction(async (tx) => {
      await assertFolder(input.parentId, tx);
      const [folder] = await tx.insert(mediaFolders).values({ name: input.name.trim(), parentId: input.parentId ?? null, createdByUserId: ctx.user.id }).returning({ id: mediaFolders.id });
      await audit({ action: "media.folder_created", entityType: "media_folder", entityId: folder!.id, actorUserId: ctx.user.id, metadata: { name: input.name }, tx });
      return { id: folder!.id };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

export async function renameMediaFolder(ctx: StaffContext, input: { id: string; name: string }): Promise<void> {
  assertStaff(ctx, "media.manage");
  try {
    const [row] = await db.update(mediaFolders).set({ name: input.name.trim() }).where(eq(mediaFolders.id, input.id)).returning({ id: mediaFolders.id });
    if (!row) throw new ActionError("That folder no longer exists.");
    await audit({ action: "media.folder_renamed", entityType: "media_folder", entityId: input.id, actorUserId: ctx.user.id, metadata: { name: input.name } });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Move a folder under another folder (or to the top level). Moving a folder into its own subtree is refused. */
export async function moveMediaFolder(ctx: StaffContext, input: { id: string; parentId: string | null }): Promise<void> {
  assertStaff(ctx, "media.manage");
  try {
    await db.transaction(async (tx) => {
      const [folder] = await tx.select().from(mediaFolders).where(eq(mediaFolders.id, input.id)).limit(1);
      if (!folder) throw new ActionError("That folder no longer exists.");
      if (input.parentId) {
        await assertFolder(input.parentId, tx);
        const ancestors = await tx.execute<{ id: string }>(sql`
          with recursive chain(id, parent_id, depth) as (
            select id, parent_id, 0 from media_folders where id = ${input.parentId}
            union all
            select f.id, f.parent_id, c.depth + 1 from media_folders f join chain c on f.id = c.parent_id where c.depth < 50
          )
          select id from chain`);
        if (ancestors.rows.some((r) => r.id === input.id)) throw new ActionError("A folder cannot be moved into one of its own sub-folders.");
      }
      await tx.update(mediaFolders).set({ parentId: input.parentId }).where(eq(mediaFolders.id, input.id));
      await audit({ action: "media.folder_moved", entityType: "media_folder", entityId: input.id, actorUserId: ctx.user.id, metadata: { parentId: input.parentId }, tx });
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Delete an empty-of-subfolders folder; its assets become unfiled. */
export async function deleteMediaFolder(ctx: StaffContext, folderId: string): Promise<void> {
  assertStaff(ctx, "media.manage");
  await db.transaction(async (tx) => {
    const [child] = await tx.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.parentId, folderId)).limit(1);
    if (child) throw new ActionError("This folder has sub-folders. Move or delete them first.");
    const [row] = await tx.delete(mediaFolders).where(eq(mediaFolders.id, folderId)).returning({ id: mediaFolders.id, name: mediaFolders.name });
    if (!row) throw new ActionError("That folder no longer exists.");
    await audit({ action: "media.folder_deleted", entityType: "media_folder", entityId: folderId, actorUserId: ctx.user.id, metadata: { name: row.name }, tx });
  });
}

// ---------------------------------------------------------------------------
// Background: consent expiry
// ---------------------------------------------------------------------------

/** Withdraw public use of assets whose time-limited consent has passed (content.publish_scheduled). */
export async function expireMediaConsents(now: Date = new Date(), limit = 100): Promise<number> {
  const due = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        isNull(mediaAssets.deletedAt),
        eq(mediaAssets.visibility, "public"),
        sql`${mediaAssets.consentExpiresAt} is not null and ${mediaAssets.consentExpiresAt} <= ${now}`,
      ),
    )
    .limit(limit);
  let handled = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string }>(sql`select id from media_assets where id = ${id} and visibility = 'public' for update skip locked`);
      if (!locked.rows.length) return;
      const [asset] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
      if (!asset) return;
      const usages = await withdrawPublicUse(asset, null, "Consent expired", tx);
      await audit({ action: "media.consent_expired", entityType: "media_asset", entityId: id, actorType: "system", metadata: { usages: usages.length }, tx });
      await notifyStaff(
        {
          event: "work.reminder",
          permission: "media.manage",
          data: { kindLabel: "media consent renewal", title: `Media item withdrawn from the website: ${asset.title}`, dueAt: asset.consentExpiresAt?.toISOString(), overdue: true },
          link: CONTENT_ADMIN_PATHS.mediaAsset(id),
          dedupeKey: `content:media-consent-expired:${id}:${asset.consentExpiresAt?.toISOString() ?? ""}`,
        },
        { tx },
      );
      handled += 1;
    });
  }
  return handled;
}

// ---------------------------------------------------------------------------
// Queries (staff)
// ---------------------------------------------------------------------------

/** Staff who manage media, or edit content and need to pick media for entries, may browse the library. */
function assertBrowse(ctx: StaffContext): void {
  assertStaff(ctx, ["media.manage", "content.edit"], "You do not have permission to browse the media library.", "any");
}

export async function listMediaAssets(ctx: StaffContext, filters: MediaListFilters, page: PageQuery): Promise<Paginated<MediaListItem>> {
  assertBrowse(ctx);
  const where: SQL[] = [isNull(mediaAssets.deletedAt)];
  if (filters.kind) where.push(eq(mediaAssets.kind, filters.kind));
  if (filters.folderId === "unfiled") where.push(isNull(mediaAssets.folderId));
  else if (filters.folderId) where.push(eq(mediaAssets.folderId, filters.folderId));
  if (filters.tag) where.push(sql`${mediaAssets.tags} @> array[${filters.tag}]::text[]`);
  where.push(eq(mediaAssets.status, filters.status ?? "active"));
  if (filters.visibility) where.push(eq(mediaAssets.visibility, filters.visibility));
  if (filters.consentStatus) where.push(eq(mediaAssets.consentStatus, filters.consentStatus));
  if (filters.q) {
    where.push(sql`(${mediaAssets.searchVector} @@ websearch_to_tsquery('simple', ${filters.q}) or ${mediaAssets.title} ilike ${likePattern(filters.q)})`);
  }
  const condition = and(...where);
  const usage = db.select({ assetId: mediaUsages.assetId, n: count().as("n") }).from(mediaUsages).groupBy(mediaUsages.assetId).as("usage");
  const [rows, totals] = await Promise.all([
    db
      .select({ asset: mediaAssets, file: files, usageCount: sql<number>`coalesce(${usage.n}, 0)::int` })
      .from(mediaAssets)
      .leftJoin(files, eq(files.id, mediaAssets.fileId))
      .leftJoin(usage, eq(usage.assetId, mediaAssets.id))
      .where(condition)
      .orderBy(desc(mediaAssets.createdAt))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(mediaAssets).where(condition),
  ]);
  const items: MediaListItem[] = rows.map(({ asset, file, usageCount }) => ({
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    altText: asset.altText,
    tags: asset.tags,
    visibility: asset.visibility,
    status: asset.status,
    consentStatus: asset.consentStatus,
    showsIdentifiablePeople: asset.showsIdentifiablePeople,
    folderId: asset.folderId,
    thumbnailUrl: asset.kind === "image" && file ? mediaUrl({ ...asset, file }, file.variants?.thumb ? "thumb" : undefined) : null,
    url: mediaUrl({ ...asset, file }),
    mimeType: file?.mimeType ?? null,
    sizeBytes: file?.sizeBytes ?? null,
    usageCount: Number(usageCount),
    createdAt: asset.createdAt,
  }));
  return paginated(items, totals[0]?.value ?? 0, page);
}

export type MediaAssetDetail = {
  asset: Omit<MediaAssetRow, "searchVector">;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null; visibility: string; scanStatus: string } | null;
  url: string | null;
  thumbnailUrl: string | null;
  folder: { id: string; name: string } | null;
  uploadedByName: string | null;
  usages: MediaUsageItem[];
  openApproval: { id: string; code: string; status: string } | null;
};

export async function getMediaAsset(ctx: StaffContext, assetId: string): Promise<MediaAssetDetail | null> {
  assertBrowse(ctx);
  const [row] = await db
    .select({ asset: mediaAssets, file: files, folderName: mediaFolders.name, uploadedByName: users.displayName })
    .from(mediaAssets)
    .leftJoin(files, eq(files.id, mediaAssets.fileId))
    .leftJoin(mediaFolders, eq(mediaFolders.id, mediaAssets.folderId))
    .leftJoin(users, eq(users.id, mediaAssets.uploadedByUserId))
    .where(and(eq(mediaAssets.id, assetId), isNull(mediaAssets.deletedAt)))
    .limit(1);
  if (!row) return null;
  const [usages, approval] = await Promise.all([
    listAssetUsages(assetId),
    db
      .select({ id: approvalRequests.id, code: approvalRequests.code, status: approvalRequests.status })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.type, "media_asset"), eq(approvalRequests.entityId, assetId), inArray(approvalRequests.status, ["pending", "in_review", "escalated", "changes_requested"])))
      .limit(1),
  ]);
  const { searchVector: _searchVector, ...asset } = row.asset;
  void _searchVector;
  return {
    asset,
    file: row.file
      ? {
          id: row.file.id,
          originalName: row.file.originalName,
          mimeType: row.file.mimeType,
          sizeBytes: row.file.sizeBytes,
          width: row.file.width,
          height: row.file.height,
          visibility: row.file.visibility,
          scanStatus: row.file.scanStatus,
        }
      : null,
    url: mediaUrl({ ...row.asset, file: row.file }),
    thumbnailUrl: row.asset.kind === "image" && row.file ? mediaUrl({ ...row.asset, file: row.file }, row.file.variants?.thumb ? "thumb" : undefined) : null,
    folder: row.asset.folderId && row.folderName ? { id: row.asset.folderId, name: row.folderName } : null,
    uploadedByName: row.uploadedByName,
    usages,
    openApproval: approval[0] ?? null,
  };
}

export type MediaFolderItem = MediaFolderRow & { assetCount: number; childCount: number };

export async function listMediaFolders(ctx: StaffContext): Promise<MediaFolderItem[]> {
  assertBrowse(ctx);
  const rows = await db
    .select({
      folder: mediaFolders,
      assetCount: sql<number>`(select count(*)::int from media_assets a where a.folder_id = ${mediaFolders.id} and a.deleted_at is null)`,
      childCount: sql<number>`(select count(*)::int from media_folders c where c.parent_id = ${mediaFolders.id})`,
    })
    .from(mediaFolders)
    .orderBy(asc(mediaFolders.name));
  return rows.map((r) => ({ ...r.folder, assetCount: Number(r.assetCount), childCount: Number(r.childCount) }));
}

/** Distinct tags in use (filter chips). */
export async function listMediaTags(ctx: StaffContext): Promise<string[]> {
  assertBrowse(ctx);
  const rows = await db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from media_assets where deleted_at is null order by 1 limit 500`);
  return rows.rows.map((r) => r.tag);
}

/** Count of assets awaiting a decision on consent (dashboard hint). */
export async function countMediaNeedingConsent(ctx: StaffContext): Promise<number> {
  assertBrowse(ctx);
  const [row] = await db
    .select({ value: count() })
    .from(mediaAssets)
    .where(and(isNull(mediaAssets.deletedAt), eq(mediaAssets.status, "active"), eq(mediaAssets.showsIdentifiablePeople, true), ne(mediaAssets.consentStatus, "obtained")));
  return row?.value ?? 0;
}
