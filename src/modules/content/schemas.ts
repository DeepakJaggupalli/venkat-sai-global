/**
 * Zod schemas for content actions (client-safe; FormData-friendly via `f` builders).
 *
 * Entry data is posted as JSON (`data:json`) and validated per collection by the service (collections.ts).
 * Date-times are ISO 8601 strings with an offset (convert `datetime-local` values in the browser, e.g.
 * `new Date(value).toISOString()`); dates are "YYYY-MM-DD".
 */
import { z } from "zod";

import { f } from "@/lib/validation";

import {
  ANNOUNCEMENT_AUDIENCE_VALUES,
  ANNOUNCEMENT_PLACEMENT_VALUES,
  ANNOUNCEMENT_PRIORITY_VALUES,
  CMS_COLLECTION_VALUES,
  CMS_ENTRY_STATUS_VALUES,
  CONTENT_CONSENT_STATUS_VALUES,
  CONTENT_LOCALE_VALUES,
  CUSTOM_METRIC_KEY_PATTERN,
  LOGO_DISPLAY_LOCATION_VALUES,
  LOGO_PERMISSION_TYPE_VALUES,
  LOGO_RELATIONSHIP_VALUES,
  MEDIA_KIND_VALUES,
  MEDIA_STATUS_VALUES,
  MEDIA_VISIBILITY_VALUES,
  PARTNER_ANNOUNCEMENT_AUDIENCES,
  PARTNER_ANNOUNCEMENT_PLACEMENTS,
  PARTNER_ANNOUNCEMENT_PRIORITIES,
  PREVIEW_TOKEN_MAX_MINUTES,
  PUBLIC_METRIC_MODE_VALUES,
} from "./constants";
import { isSafeLink } from "./embeds";

/** Lower-case kebab-case segments, optionally nested with "/" (cms_entries_slug_chk). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;

const optionalBlank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** ISO 8601 date-time with offset (or a Date) → Date. */
export const isoDateTime = () =>
  z.preprocess(
    (v) => (v instanceof Date ? v.toISOString() : v),
    z.iso.datetime({ offset: true, error: "Enter a valid date and time" }).transform((v) => new Date(v)),
  );

/** Optional ISO date-time; blank → undefined, explicit null (JSON) → null (clears the value). */
export const optionalIsoDateTime = () =>
  z.preprocess((v) => (v === "" ? undefined : v instanceof Date ? v.toISOString() : v), z.union([z.null(), isoDateTime()]).optional());

/** YYYY-MM-DD → the same string (validated). */
export const calendarDate = () =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Enter a valid date");

const tagList = () =>
  z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : String(v).split(",")),
    z
      .array(z.string().trim().toLowerCase().max(40, "Tags are at most 40 characters"))
      .transform((tags) => [...new Set(tags.filter(Boolean))])
      .pipe(z.array(z.string()).max(20, "Use at most 20 tags")),
  );

/** Site path or http(s) URL. */
const safeLink = (opts: { allowRelative: boolean }) =>
  z
    .string()
    .trim()
    .refine((v) => isSafeLink(v, opts), opts.allowRelative ? "Enter a site path starting with / or a full http(s) link" : "Enter a full https:// link");

// ---------------------------------------------------------------------------
// CMS entries
// ---------------------------------------------------------------------------

export const cmsSeoSchema = z
  .object({
    title: optionalBlank(z.string().trim().max(70, "Keep the SEO title under 70 characters")),
    description: optionalBlank(z.string().trim().max(200, "Keep the description under 200 characters")),
    ogImageAssetId: optionalBlank(z.uuid("Choose an image")),
    noindex: optionalBlank(f.bool()),
    canonicalUrl: optionalBlank(z.string().trim().refine((v) => /^https:\/\//.test(v) && isSafeLink(v, { allowRelative: false }), "Enter a full https:// link")),
  })
  .transform((seo) => Object.fromEntries(Object.entries(seo).filter(([, v]) => v !== undefined && v !== false)));

const entryContentFields = {
  title: f.text({ max: 200, label: "Title" }),
  slug: optionalBlank(z.string().trim().toLowerCase().max(200, "Keep the slug under 200 characters").regex(SLUG_PATTERN, "Use lower-case letters, numbers and hyphens")),
  summary: f.optionalText(600),
  data: z.preprocess((v) => (v === undefined ? {} : v), z.record(z.string(), z.unknown())),
  seo: z.preprocess((v) => (v === undefined ? {} : v), cmsSeoSchema),
  tags: tagList(),
  heroAssetId: optionalBlank(z.uuid("Choose an image")),
  /** Change note stored with the version ("Updated eligibility section"). */
  note: f.optionalText(300),
};

export const createEntrySchema = z.object({
  collection: z.enum(CMS_COLLECTION_VALUES, { error: "Choose a collection" }),
  locale: z.preprocess((v) => (v === undefined || v === "" ? "en" : v), z.enum(CONTENT_LOCALE_VALUES)),
  ...entryContentFields,
});
export type CreateEntryInput = z.output<typeof createEntrySchema>;

export const updateEntrySchema = z.object({
  id: f.uuid(),
  /** Version the editor loaded; a newer saved version means someone else changed it. */
  expectedVersion: f.optionalInt({ min: 1 }),
  ...entryContentFields,
});
export type UpdateEntryInput = z.output<typeof updateEntrySchema>;

export const entryIdSchema = z.object({ id: f.uuid() });

export const entryReasonSchema = z.object({ id: f.uuid(), reason: f.optionalText(500) });

export const publishEntrySchema = z.object({
  id: f.uuid(),
  /** Defaults to the latest saved version. */
  version: f.optionalInt({ min: 1 }),
  note: f.optionalText(500),
});
export type PublishEntryInput = z.output<typeof publishEntrySchema>;

export const requestPublicationSchema = z.object({
  id: f.uuid(),
  version: f.optionalInt({ min: 1 }),
  publishAt: optionalIsoDateTime(),
  note: f.optionalText(500),
});
export type RequestPublicationInput = z.output<typeof requestPublicationSchema>;

export const scheduleEntrySchema = z
  .object({
    id: f.uuid(),
    version: f.optionalInt({ min: 1 }),
    /** null clears it; undefined leaves it unchanged. */
    publishAt: optionalIsoDateTime(),
    unpublishAt: optionalIsoDateTime(),
  })
  .refine((v) => v.publishAt !== undefined || v.unpublishAt !== undefined, { message: "Choose when to publish or unpublish", path: ["publishAt"] });
export type ScheduleEntryInput = z.output<typeof scheduleEntrySchema>;

export const rollbackEntrySchema = z.object({
  id: f.uuid(),
  version: f.int({ min: 1 }),
  /** Publish the restored version immediately (consent-sensitive collections go to approval). */
  publish: f.bool(),
});
export type RollbackEntryInput = z.output<typeof rollbackEntrySchema>;

export const duplicateEntrySchema = z.object({
  id: f.uuid(),
  title: f.optionalText(200),
  locale: optionalBlank(z.enum(CONTENT_LOCALE_VALUES)),
});

export const reorderEntriesSchema = z.object({
  collection: z.enum(CMS_COLLECTION_VALUES),
  ids: z.array(z.uuid()).min(1).max(500),
});

export const setFeaturedSchema = z.object({ id: f.uuid(), featured: f.bool() });

export const entryConsentSchema = z.object({
  id: f.uuid(),
  consentStatus: z.enum(CONTENT_CONSENT_STATUS_VALUES),
  consentNotes: f.optionalText(1_000),
  consentFileId: optionalBlank(z.uuid()),
  consentObtainedAt: optionalBlank(calendarDate()),
  consentExpiresAt: optionalBlank(calendarDate()),
});
export type EntryConsentInput = z.output<typeof entryConsentSchema>;

export const entryLogoPermissionSchema = z.object({ id: f.uuid(), logoPermissionId: z.union([z.uuid(), z.null()]) });

export const previewLinkSchema = z.object({
  id: f.uuid(),
  version: z.union([z.literal("latest"), f.int({ min: 1 })]).default("latest"),
  ttlMinutes: f.optionalInt({ min: 5, max: PREVIEW_TOKEN_MAX_MINUTES }),
});

export const entryListFiltersSchema = z.object({
  collection: z.enum(CMS_COLLECTION_VALUES),
  status: optionalBlank(z.enum(CMS_ENTRY_STATUS_VALUES)),
  locale: optionalBlank(z.enum(CONTENT_LOCALE_VALUES)),
  q: optionalBlank(z.string().trim().max(100)),
  tag: optionalBlank(z.string().trim().toLowerCase().max(40)),
  featured: optionalBlank(f.bool()),
  deleted: optionalBlank(f.bool()),
  sort: optionalBlank(z.enum(["manual", "updated", "title", "published"])),
});
export type EntryListFilters = z.output<typeof entryListFiltersSchema>;

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

/** Tri-state answer: "yes" | "no" | blank (not yet assessed). */
const peopleAnswer = () =>
  z.preprocess((v) => (v === "yes" || v === true ? true : v === "no" || v === false ? false : undefined), z.boolean().optional());

const mediaDetailsFields = {
  title: f.text({ max: 200, label: "Title" }),
  altText: f.optionalText(300),
  /** Purely decorative image: stores an empty text alternative. */
  decorative: f.bool(),
  caption: f.optionalText(500),
  description: f.optionalText(2_000),
  credit: f.optionalText(200),
  tags: tagList(),
  folderId: optionalBlank(z.uuid()),
  showsIdentifiablePeople: peopleAnswer(),
};

export const createMediaAssetSchema = z.object({
  fileId: f.uuid(),
  ...mediaDetailsFields,
  /** Public requires a people assessment (and consent when people are shown, which goes to approval). */
  visibility: z.preprocess((v) => (v === undefined || v === "" ? "internal" : v), z.enum(MEDIA_VISIBILITY_VALUES)),
});
export type CreateMediaAssetInput = z.output<typeof createMediaAssetSchema>;

export const createEmbedAssetSchema = z.object({
  url: z.string().trim().min(1, "Enter a YouTube or Vimeo link").max(500),
  ...mediaDetailsFields,
  visibility: z.preprocess((v) => (v === undefined || v === "" ? "internal" : v), z.enum(MEDIA_VISIBILITY_VALUES)),
});
export type CreateEmbedAssetInput = z.output<typeof createEmbedAssetSchema>;

export const updateMediaAssetSchema = z.object({ id: f.uuid(), ...mediaDetailsFields });
export type UpdateMediaAssetInput = z.output<typeof updateMediaAssetSchema>;

export const mediaConsentSchema = z.object({
  id: f.uuid(),
  consentStatus: z.enum(CONTENT_CONSENT_STATUS_VALUES),
  consentNotes: f.optionalText(1_000),
  consentFileId: optionalBlank(z.uuid()),
  consentObtainedAt: optionalBlank(calendarDate()),
  consentExpiresAt: optionalBlank(calendarDate()),
});
export type MediaConsentInput = z.output<typeof mediaConsentSchema>;

export const mediaVisibilitySchema = z.object({ id: f.uuid(), visibility: z.enum(MEDIA_VISIBILITY_VALUES) });

export const mediaListFiltersSchema = z.object({
  q: optionalBlank(z.string().trim().max(100)),
  kind: optionalBlank(z.enum(MEDIA_KIND_VALUES)),
  folderId: optionalBlank(z.union([z.uuid(), z.literal("unfiled")])),
  tag: optionalBlank(z.string().trim().toLowerCase().max(40)),
  status: optionalBlank(z.enum(MEDIA_STATUS_VALUES)),
  visibility: optionalBlank(z.enum(MEDIA_VISIBILITY_VALUES)),
  consentStatus: optionalBlank(z.enum(CONTENT_CONSENT_STATUS_VALUES)),
});
export type MediaListFilters = z.output<typeof mediaListFiltersSchema>;

export const mediaFolderSchema = z.object({
  name: f.text({ max: 120, label: "Folder name" }),
  parentId: optionalBlank(z.uuid()),
});

export const renameMediaFolderSchema = z.object({ id: f.uuid(), name: f.text({ max: 120, label: "Folder name" }) });
export const moveMediaFolderSchema = z.object({ id: f.uuid(), parentId: z.union([z.uuid(), z.null()]) });

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const announcementBase = {
  title: f.text({ max: 160, label: "Title" }),
  body: f.optionalText(600),
  linkUrl: optionalBlank(safeLink({ allowRelative: true })),
  linkLabel: f.optionalText(60),
  startsAt: optionalIsoDateTime(),
  endsAt: optionalIsoDateTime(),
};

function announcementWindow<T extends { startsAt?: Date | null; endsAt?: Date | null; linkUrl?: string; linkLabel?: string }>(v: T, ctx: z.RefinementCtx): void {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
  if (v.linkLabel && !v.linkUrl) ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "Add the link for this label" });
}

export const announcementSchema = z
  .object({
    id: optionalBlank(z.uuid()),
    ...announcementBase,
    audience: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(ANNOUNCEMENT_AUDIENCE_VALUES)).min(1, "Choose who should see it")),
    placements: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(ANNOUNCEMENT_PLACEMENT_VALUES)).min(1, "Choose where it appears")),
    priority: z.preprocess((v) => (v === undefined || v === "" ? "normal" : v), z.enum(ANNOUNCEMENT_PRIORITY_VALUES)),
    isDismissible: z.preprocess((v) => (v === undefined ? true : v), f.bool()),
  })
  .superRefine(announcementWindow);
export type AnnouncementInput = z.output<typeof announcementSchema>;

export const partnerAnnouncementSchema = z
  .object({
    id: optionalBlank(z.uuid()),
    ...announcementBase,
    audience: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(PARTNER_ANNOUNCEMENT_AUDIENCES)).min(1, "Choose who should see it")),
    placements: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(PARTNER_ANNOUNCEMENT_PLACEMENTS)).min(1, "Choose where it appears")),
    priority: z.preprocess((v) => (v === undefined || v === "" ? "normal" : v), z.enum(PARTNER_ANNOUNCEMENT_PRIORITIES)),
  })
  .superRefine(announcementWindow);
export type PartnerAnnouncementInput = z.output<typeof partnerAnnouncementSchema>;

export const announcementIdSchema = z.object({ id: f.uuid() });

// ---------------------------------------------------------------------------
// Public metrics
// ---------------------------------------------------------------------------

export const metricKeySchema = z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,62}$/, "Invalid metric key") });

export const updateMetricSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,62}$/),
  label: f.text({ max: 80, label: "Label" }),
  definition: f.optionalText(600),
  mode: z.enum(PUBLIC_METRIC_MODE_VALUES),
  isVisible: f.bool(),
  minDisplayValue: f.optionalInt({ min: 0 }),
  sortOrder: z.preprocess((v) => (v === undefined || v === "" ? 0 : v), f.int({ min: -100_000, max: 100_000 })),
});
export type UpdateMetricInput = z.output<typeof updateMetricSchema>;

export const manualMetricValueSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,62}$/),
  manualValue: f.int({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  asOfDate: calendarDate(),
  evidenceNote: f.optionalText(1_000),
  evidenceFileId: optionalBlank(z.uuid()),
});
export type ManualMetricValueInput = z.output<typeof manualMetricValueSchema>;

export const customMetricSchema = z.object({
  key: z.string().trim().toLowerCase().regex(CUSTOM_METRIC_KEY_PATTERN, "Use custom_ followed by lower-case letters, numbers or underscores"),
  label: f.text({ max: 80, label: "Label" }),
  definition: f.optionalText(600),
});
export type CustomMetricInput = z.output<typeof customMetricSchema>;

// ---------------------------------------------------------------------------
// Logo permissions
// ---------------------------------------------------------------------------

export const logoPermissionSchema = z.object({
  id: optionalBlank(z.uuid()),
  organizationName: f.text({ max: 200, label: "Organisation name" }),
  organizationId: optionalBlank(z.uuid()),
  relationship: z.enum(LOGO_RELATIONSHIP_VALUES),
  logoAssetId: optionalBlank(z.uuid()),
  permissionType: z.enum(LOGO_PERMISSION_TYPE_VALUES),
  evidenceFileId: optionalBlank(z.uuid()),
  evidenceReference: f.optionalText(500),
  grantedByName: f.optionalText(160),
  grantedByDesignation: f.optionalText(160),
  grantedAt: optionalBlank(calendarDate()),
  expiresAt: optionalBlank(calendarDate()),
  displayLocations: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(LOGO_DISPLAY_LOCATION_VALUES)).transform((l) => [...new Set(l)])),
  conditions: f.optionalText(1_000),
  notes: f.optionalText(2_000),
});
export type LogoPermissionInput = z.output<typeof logoPermissionSchema>;

export const revokeLogoPermissionSchema = z.object({ id: f.uuid(), reason: f.text({ max: 500, label: "Reason" }) });
