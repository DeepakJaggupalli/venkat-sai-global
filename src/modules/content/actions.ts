"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { cmsEntries, type CmsCollection } from "@/db/schema";
import { ORG_TYPES } from "@/db/schema/_constants";
import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import { getCollection, publicPathFor } from "./collections";
import { isSingletonCollection } from "./constants";
import { CONTENT_ADMIN_PATHS, PARTNER_ANNOUNCEMENT_PATHS } from "./links";
import {
  announcementIdSchema,
  announcementSchema,
  createEmbedAssetSchema,
  createEntrySchema,
  createMediaAssetSchema,
  customMetricSchema,
  duplicateEntrySchema,
  entryConsentSchema,
  entryIdSchema,
  entryLogoPermissionSchema,
  entryReasonSchema,
  logoPermissionSchema,
  manualMetricValueSchema,
  mediaConsentSchema,
  mediaFolderSchema,
  mediaVisibilitySchema,
  metricKeySchema,
  moveMediaFolderSchema,
  partnerAnnouncementSchema,
  previewLinkSchema,
  publishEntrySchema,
  renameMediaFolderSchema,
  reorderEntriesSchema,
  requestPublicationSchema,
  revokeLogoPermissionSchema,
  rollbackEntrySchema,
  scheduleEntrySchema,
  setFeaturedSchema,
  updateEntrySchema,
  updateMediaAssetSchema,
  updateMetricSchema,
} from "./schemas";
import * as service from "./service";
import type { PublishOutcome } from "./types";

/**
 * Server Actions of the content module. Each authorises the caller (requireStaff / requireOrgMember), validates
 * input with zod and calls the service (which re-checks permissions). Admin pages live under /admin/content,
 * /admin/media, /admin/announcements and /admin/public-metrics (CONTENT_ADMIN_PATHS).
 */

const idOnly = z.object({ id: f.uuid() });

function revalidateCollection(collection: CmsCollection, slug?: string | null): void {
  revalidatePath(CONTENT_ADMIN_PATHS.content);
  revalidatePath(CONTENT_ADMIN_PATHS.collection(collection));
  if (isSingletonCollection(collection) && collection !== "about") {
    // Site settings, homepage and navigation appear on every public page.
    revalidatePath("/", "layout");
    return;
  }
  const path = slug ? publicPathFor(collection, slug) : null;
  if (path) revalidatePath(path.split("?")[0]!);
}

async function entryRef(id: string): Promise<{ collection: CmsCollection; slug: string } | null> {
  const [row] = await db.select({ collection: cmsEntries.collection, slug: cmsEntries.slug }).from(cmsEntries).where(eq(cmsEntries.id, id)).limit(1);
  return row ?? null;
}

async function revalidateEntry(id: string): Promise<void> {
  const ref = await entryRef(id);
  if (ref) {
    revalidateCollection(ref.collection, ref.slug);
    revalidatePath(CONTENT_ADMIN_PATHS.entry(ref.collection, id));
  }
}

function publishMessage(outcome: PublishOutcome): string {
  if (outcome.outcome === "published") return "Published.";
  if (outcome.outcome === "scheduled") return "Scheduled.";
  return `Sent for approval (${outcome.approvalCode}).`;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** Create a draft. Form: collection, locale?, title, slug?, summary?, `data:json`, `seo:json`, `tags[]`, heroAssetId?, note?. */
export const createEntryAction = createFormAction(createEntrySchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const result = await service.createEntry(ctx, input);
  revalidateCollection(input.collection);
  return ok(result, `${getCollection(input.collection).singularLabel} created.`);
});

/** Save a new version. Form: id, expectedVersion, title, slug?, summary?, `data:json`, `seo:json`, `tags[]`, heroAssetId?, note?. */
export const updateEntryAction = createFormAction(updateEntrySchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const result = await service.updateEntry(ctx, input);
  await revalidateEntry(input.id);
  return ok(result, result.changed ? `Saved as version ${result.version}.` : "No changes to save.");
});

export const publishEntryAction = createAction(publishEntrySchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  const outcome = await service.publishEntry(ctx, input);
  await revalidateEntry(input.id);
  return ok(outcome, publishMessage(outcome));
});

export const requestPublicationAction = createAction(requestPublicationSchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const outcome = await service.requestPublication(ctx, input);
  await revalidateEntry(input.id);
  return ok(outcome, publishMessage(outcome));
});

/** publishAt / unpublishAt: ISO 8601 with offset; null clears; omitted leaves unchanged. */
export const scheduleEntryAction = createAction(scheduleEntrySchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  const result = await service.scheduleEntry(ctx, input);
  await revalidateEntry(input.id);
  return ok(result, result.approval ? `Sent for approval (${result.approval.code}).` : "Schedule saved.");
});

export const unpublishEntryAction = createAction(entryReasonSchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  await service.unpublishEntry(ctx, input.id, input.reason);
  await revalidateEntry(input.id);
  return ok(undefined, "Unpublished. The entry is now a draft.");
});

export const archiveEntryAction = createAction(entryReasonSchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  await service.archiveEntry(ctx, input.id, input.reason);
  await revalidateEntry(input.id);
  return ok(undefined, "Archived.");
});

export const restoreEntryAction = createAction(entryIdSchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  await service.restoreEntry(ctx, input.id);
  await revalidateEntry(input.id);
  return ok(undefined, "Restored as a draft.");
});

export const deleteEntryAction = createAction(entryReasonSchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const ref = await entryRef(input.id);
  await service.softDeleteEntry(ctx, input.id, input.reason);
  if (ref) revalidateCollection(ref.collection, ref.slug);
  return ok(undefined, "Moved to the bin.");
});

export const rollbackEntryAction = createAction(rollbackEntrySchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  const result = await service.rollbackEntry(ctx, input);
  await revalidateEntry(input.id);
  return ok(result, result.outcome ? `Version ${input.version} restored. ${publishMessage(result.outcome)}` : `Version ${input.version} restored as version ${result.version}.`);
});

export const duplicateEntryAction = createAction(duplicateEntrySchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const result = await service.duplicateEntry(ctx, input);
  await revalidateEntry(result.id);
  return ok(result, "Copy created as a draft.");
});

export const reorderEntriesAction = createAction(reorderEntriesSchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  await service.reorderEntries(ctx, input);
  revalidateCollection(input.collection);
  return ok(undefined, "Order saved.");
});

export const setEntryFeaturedAction = createAction(setFeaturedSchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  await service.setEntryFeatured(ctx, input.id, input.featured);
  await revalidateEntry(input.id);
  return ok(undefined, input.featured ? "Featured." : "No longer featured.");
});

/** Consent evidence. Form: id, consentStatus, consentNotes?, consentFileId? (upload purpose cms_media, private), consentObtainedAt?, consentExpiresAt?. */
export const updateEntryConsentAction = createFormAction(entryConsentSchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const result = await service.updateEntryConsent(ctx, input);
  await revalidateEntry(input.id);
  return ok(result, result.takenOffline ? "Consent updated. The entry was taken offline." : "Consent updated.");
});

export const setEntryLogoPermissionAction = createAction(entryLogoPermissionSchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  await service.setEntryLogoPermission(ctx, input);
  await revalidateEntry(input.id);
  return ok(undefined, input.logoPermissionId ? "Logo permission linked." : "Logo permission removed.");
});

export const createPreviewLinkAction = createAction(previewLinkSchema, async (input) => {
  const ctx = await requireStaff("content.view");
  const link = await service.createPreviewLink(ctx, input);
  return ok({ url: link.url, token: link.token, expiresAt: link.expiresAt.toISOString(), version: link.version }, "Preview link created.");
});

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

/** Form: fileId (upload with purpose cms_media), title, altText?, decorative, caption?, description?, credit?, `tags[]`, folderId?, showsIdentifiablePeople ("yes"|"no"|""), visibility. */
export const createMediaAssetAction = createFormAction(createMediaAssetSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  const result = await service.createMediaAsset(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(result, result.needsConsent ? "Added. Record the consent of the people shown, then request public use." : "Added to the media library.");
});

export const createEmbedAssetAction = createFormAction(createEmbedAssetSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  const result = await service.createEmbedAsset(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(result, "Video added to the media library.");
});

export const updateMediaAssetAction = createFormAction(updateMediaAssetSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  const result = await service.updateMediaAsset(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  revalidatePath(CONTENT_ADMIN_PATHS.mediaAsset(input.id));
  return ok(result, result.madeInternal ? "Saved. The item is now internal until consent and public use are confirmed." : "Saved.");
});

export const updateMediaConsentAction = createFormAction(mediaConsentSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  const result = await service.updateMediaConsent(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.mediaAsset(input.id));
  if (result.withdrawnFromPublicUse) revalidatePath("/", "layout");
  return ok(result, result.withdrawnFromPublicUse ? "Consent updated. The item was removed from the website." : "Consent updated.");
});

export const setMediaVisibilityAction = createAction(mediaVisibilitySchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  const result = await service.setMediaVisibility(ctx, input.id, input.visibility);
  revalidatePath(CONTENT_ADMIN_PATHS.mediaAsset(input.id));
  if (input.visibility === "internal") revalidatePath("/", "layout");
  return ok(result, result.approval ? `Public use sent for approval (${result.approval.code}).` : result.visibility === "public" ? "The item is now public." : "The item is now internal.");
});

export const archiveMediaAssetAction = createAction(idOnly, async (input) => {
  const ctx = await requireStaff("media.manage");
  await service.archiveMediaAsset(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(undefined, "Archived.");
});

export const restoreMediaAssetAction = createAction(idOnly, async (input) => {
  const ctx = await requireStaff("media.manage");
  await service.restoreMediaAsset(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(undefined, "Restored.");
});

export const deleteMediaAssetAction = createAction(idOnly, async (input) => {
  const ctx = await requireStaff("media.manage");
  await service.deleteMediaAsset(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(undefined, "Deleted.");
});

export const createMediaFolderAction = createFormAction(mediaFolderSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  const result = await service.createMediaFolder(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(result, "Folder created.");
});

export const renameMediaFolderAction = createFormAction(renameMediaFolderSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  await service.renameMediaFolder(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(undefined, "Folder renamed.");
});

export const moveMediaFolderAction = createAction(moveMediaFolderSchema, async (input) => {
  const ctx = await requireStaff("media.manage");
  await service.moveMediaFolder(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(undefined, "Folder moved.");
});

export const deleteMediaFolderAction = createAction(idOnly, async (input) => {
  const ctx = await requireStaff("media.manage");
  await service.deleteMediaFolder(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.media);
  return ok(undefined, "Folder deleted. Its items are now unfiled.");
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** Create (no id) or update. Form: id?, title, body?, `audience[]`, `placements[]`, priority, linkUrl?, linkLabel?, startsAt?, endsAt? (ISO), isDismissible. */
export const saveAnnouncementAction = createFormAction(announcementSchema, async (input) => {
  const ctx = await requireStaff("announcements.manage");
  const result = await service.saveAnnouncement(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.announcements);
  revalidatePath("/", "layout");
  return ok(result, result.created ? "Announcement created as a draft." : "Announcement saved.");
});

export const publishAnnouncementAction = createAction(announcementIdSchema, async (input) => {
  const ctx = await requireStaff("announcements.manage");
  const result = await service.publishAnnouncement(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.announcements);
  revalidatePath("/", "layout");
  return ok(result, result.status === "scheduled" ? "Scheduled." : "Published.");
});

export const expireAnnouncementAction = createAction(announcementIdSchema, async (input) => {
  const ctx = await requireStaff("announcements.manage");
  await service.expireAnnouncement(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.announcements);
  revalidatePath("/", "layout");
  return ok(undefined, "Announcement ended.");
});

export const archiveAnnouncementAction = createAction(announcementIdSchema, async (input) => {
  const ctx = await requireStaff("announcements.manage");
  await service.archiveAnnouncement(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.announcements);
  revalidatePath("/", "layout");
  return ok(undefined, "Archived.");
});

export const restoreAnnouncementAction = createAction(announcementIdSchema, async (input) => {
  const ctx = await requireStaff("announcements.manage");
  await service.restoreAnnouncement(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.announcements);
  return ok(undefined, "Restored as a draft.");
});

export const deleteAnnouncementAction = createAction(announcementIdSchema, async (input) => {
  const ctx = await requireStaff("announcements.manage");
  await service.deleteAnnouncement(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.announcements);
  return ok(undefined, "Deleted.");
});

const orgTypeField = z.object({ orgType: z.enum(ORG_TYPES) });

/** Partner organisations: draft / edit and submit an announcement request. Form adds a hidden `orgType`. */
export const savePartnerAnnouncementAction = createFormAction(partnerAnnouncementSchema.and(orgTypeField), async (input) => {
  const ctx = await requireOrgMember(input.orgType);
  const result = await service.savePartnerAnnouncement(ctx, input);
  revalidatePath(PARTNER_ANNOUNCEMENT_PATHS[input.orgType]);
  return ok(result, `Sent to Venkat Sai for review (${result.approvalCode}).`);
});

export const withdrawPartnerAnnouncementAction = createAction(announcementIdSchema.extend({ orgType: z.enum(ORG_TYPES) }), async (input) => {
  const ctx = await requireOrgMember(input.orgType);
  await service.withdrawPartnerAnnouncement(ctx, input.id);
  revalidatePath(PARTNER_ANNOUNCEMENT_PATHS[input.orgType]);
  revalidatePath("/", "layout");
  return ok(undefined, "Announcement withdrawn.");
});

// ---------------------------------------------------------------------------
// Public metrics
// ---------------------------------------------------------------------------

export const updatePublicMetricAction = createFormAction(updateMetricSchema, async (input) => {
  const ctx = await requireStaff("metrics.public_manage");
  await service.updatePublicMetric(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.publicMetrics);
  revalidatePath("/");
  return ok(undefined, "Metric saved.");
});

export const setManualMetricValueAction = createFormAction(manualMetricValueSchema, async (input) => {
  const ctx = await requireStaff("metrics.public_manage");
  const result = await service.setManualMetricValue(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.publicMetrics);
  revalidatePath("/");
  return ok(result, result.needsApproval ? "Figure saved. It must be approved before it can be shown." : "Figure saved.");
});

export const approveManualMetricValueAction = createAction(metricKeySchema, async (input) => {
  const ctx = await requireStaff("metrics.public_manage");
  await service.approveManualMetricValue(ctx, input.key);
  revalidatePath(CONTENT_ADMIN_PATHS.publicMetrics);
  return ok(undefined, "Figure approved.");
});

export const createCustomMetricAction = createFormAction(customMetricSchema, async (input) => {
  const ctx = await requireStaff("metrics.public_manage");
  const result = await service.createCustomMetric(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.publicMetrics);
  return ok(result, "Metric created (hidden).");
});

export const deleteCustomMetricAction = createAction(metricKeySchema, async (input) => {
  const ctx = await requireStaff("metrics.public_manage");
  await service.deleteCustomMetric(ctx, input.key);
  revalidatePath(CONTENT_ADMIN_PATHS.publicMetrics);
  revalidatePath("/");
  return ok(undefined, "Metric deleted.");
});

export const refreshLiveMetricsAction = createAction(z.object({}), async () => {
  await requireStaff("metrics.public_manage");
  const refreshed = await service.refreshLiveMetrics(new Date());
  revalidatePath(CONTENT_ADMIN_PATHS.publicMetrics);
  revalidatePath("/");
  return ok({ refreshed }, "Live figures recalculated.");
});

// ---------------------------------------------------------------------------
// Logo permissions
// ---------------------------------------------------------------------------

/** Create (no id) or update. Evidence file: upload with purpose cms_media (stored private). */
export const saveLogoPermissionAction = createFormAction(logoPermissionSchema, async (input) => {
  const ctx = await requireStaff("content.edit");
  const result = await service.saveLogoPermission(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.logoPermissions);
  return ok(result, result.created ? "Logo permission recorded (pending review)." : "Logo permission saved.");
});

export const approveLogoPermissionAction = createAction(idOnly, async (input) => {
  const ctx = await requireStaff("content.publish");
  await service.approveLogoPermission(ctx, input.id);
  revalidatePath(CONTENT_ADMIN_PATHS.logoPermissions);
  return ok(undefined, "Logo permission approved.");
});

export const revokeLogoPermissionAction = createFormAction(revokeLogoPermissionSchema, async (input) => {
  const ctx = await requireStaff("content.publish");
  const result = await service.revokeLogoPermission(ctx, input);
  revalidatePath(CONTENT_ADMIN_PATHS.logoPermissions);
  if (result.logosTakenOffline) revalidatePath("/", "layout");
  return ok(result, result.logosTakenOffline ? `Revoked. ${result.logosTakenOffline} logo(s) taken offline.` : "Revoked.");
});
