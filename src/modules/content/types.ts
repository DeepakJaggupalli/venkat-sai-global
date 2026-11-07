/**
 * Content module types (client-safe).
 */
import type {
  announcements,
  AnnouncementAudience,
  AnnouncementPlacement,
  AnnouncementPriority,
  AnnouncementStatus,
  cmsEntries,
  CmsCollection,
  CmsEntryStatus,
  CmsSeo,
  cmsEntryVersions,
  ContentConsentStatus,
  logoPermissions,
  LogoDisplayLocation,
  LogoRelationship,
  mediaAssets,
  mediaFolders,
  MediaEmbedProvider,
  MediaKind,
  PublicMetricMode,
  publicMetrics,
} from "@/db/schema";
import type { Paginated } from "@/lib/http";

import type { CollectionData } from "./collections";

export type CmsEntryRow = typeof cmsEntries.$inferSelect;
export type CmsEntryVersionRow = typeof cmsEntryVersions.$inferSelect;
export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type MediaFolderRow = typeof mediaFolders.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type PublicMetricRow = typeof publicMetrics.$inferSelect;
export type LogoPermissionRow = typeof logoPermissions.$inferSelect;

export type { CmsSeo };

// ---------------------------------------------------------------------------
// Public site
// ---------------------------------------------------------------------------

/** A media item safe to render publicly (public, active, not deleted; file public). */
export type PublicMediaAsset = {
  id: string;
  kind: MediaKind;
  title: string;
  /** Text alternative; "" = decorative image; null for non-images without one. */
  alt: string | null;
  caption: string | null;
  credit: string | null;
  /** File URL (/media/<id>/<name>) or, for embeds, the player URL. */
  url: string;
  thumbnailUrl: string | null;
  /** Responsive image variants (WebP) when generated. */
  variants: { thumb?: string; md?: string; lg?: string };
  width: number | null;
  height: number | null;
  mimeType: string | null;
  embedProvider: MediaEmbedProvider | null;
  embedUrl: string | null;
};

export type AssetMap = Record<string, PublicMediaAsset>;

/** A published CMS entry as the public site renders it (internal fields stripped). */
export type PublishedEntry<K extends CmsCollection = CmsCollection> = {
  id: string;
  collection: K;
  slug: string;
  locale: string;
  title: string;
  summary: string | null;
  data: CollectionData<K>;
  seo: CmsSeo;
  tags: string[];
  isFeatured: boolean;
  sortOrder: number;
  heroAssetId: string | null;
  /** First publication of the current publication cycle. */
  publishedAt: Date;
  /** When the live version was saved (sitemap lastmod). */
  contentUpdatedAt: Date;
  /** Public URL, or null when the collection has no page per entry. */
  path: string | null;
  /** client_logos only: name and relationship exactly as the approved permission allows. */
  logo: { organizationName: string; relationship: LogoRelationship } | null;
};

/** Published entries referenced from the returned data (one level), keyed by entry id. */
export type ReferenceMap = Record<string, PublishedEntry>;

export type ResolvedContent = {
  /** Public media referenced by the entries (and by their referenced entries), keyed by asset id. */
  assets: AssetMap;
  references: ReferenceMap;
};

export type PublishedEntryPage<K extends CmsCollection> = Paginated<PublishedEntry<K>> & ResolvedContent;

export type PublishedEntryDetail<K extends CmsCollection> = ResolvedContent & {
  entry: PublishedEntry<K>;
  /** True when rendered from a preview token (show a "Preview" ribbon, noindex). */
  preview: boolean;
};

export type ContentSearchResult = {
  collection: CmsCollection;
  slug: string;
  title: string;
  summary: string | null;
  /** Plain-text snippet with the matching words wrapped in «…» (escape before rendering; no HTML). */
  snippet: string | null;
  path: string;
  rank: number;
};

export type ActiveAnnouncement = {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  priority: AnnouncementPriority;
  isDismissible: boolean;
  placements: AnnouncementPlacement[];
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  /** True for announcements requested by a partner organisation. */
  fromPartner: boolean;
};

export type PublicMetric = {
  key: string;
  label: string;
  value: number;
  definition: string;
  /** live: the date the value was computed; manual: the approved "as of" date (YYYY-MM-DD). */
  asOf: string;
  mode: "live" | "manual";
};

// ---------------------------------------------------------------------------
// Command Centre
// ---------------------------------------------------------------------------

export type AdminEntryListItem = {
  id: string;
  collection: CmsCollection;
  slug: string;
  locale: string;
  title: string;
  status: CmsEntryStatus;
  currentVersion: number;
  publishedVersion: number | null;
  scheduledVersion: number | null;
  hasUnpublishedChanges: boolean;
  publishAt: Date | null;
  unpublishAt: Date | null;
  isFeatured: boolean;
  sortOrder: number;
  consentStatus: ContentConsentStatus;
  updatedAt: Date;
  updatedByName: string | null;
  deletedAt: Date | null;
  path: string | null;
};

/** The editable (latest saved) content of an entry. */
export type EditableContent = {
  version: number;
  slug: string;
  title: string;
  summary: string | null;
  data: Record<string, unknown>;
  seo: CmsSeo;
  tags: string[];
  heroAssetId: string | null;
};

export type EntryVersionSummary = {
  version: number;
  title: string;
  note: string | null;
  createdAt: Date;
  createdByName: string | null;
  isCurrent: boolean;
  isPublished: boolean;
  isScheduled: boolean;
};

export type EntryApprovalSummary = {
  id: string;
  code: string;
  type: string;
  status: string;
  createdAt: Date;
  decisionReason: string | null;
};

export type AdminEntryDetail = {
  entry: Omit<CmsEntryRow, "searchVector" | "searchText">;
  /** Latest saved version (what the editor edits). */
  latest: EditableContent;
  versions: EntryVersionSummary[];
  hasUnpublishedChanges: boolean;
  openApproval: EntryApprovalSummary | null;
  latestApproval: EntryApprovalSummary | null;
  publicPath: string | null;
  logoPermission: { id: string; organizationName: string; status: string; expiresAt: Date | null; displayLocations: LogoDisplayLocation[] } | null;
  mediaUsageCount: number;
};

export type FieldChange = {
  /** "title", "seo.description", "data.faqs"… */
  path: string;
  label: string;
  kind: "added" | "removed" | "changed";
  before: unknown;
  after: unknown;
};

export type EntryVersionDiff = {
  entryId: string;
  from: number;
  to: number;
  changes: FieldChange[];
};

export type PublishOutcome =
  | { outcome: "published"; version: number }
  | { outcome: "scheduled"; version: number; publishAt: Date }
  | { outcome: "submitted_for_approval"; approvalId: string; approvalCode: string };

export type PreviewLink = { token: string; url: string | null; expiresAt: Date; version: number | "latest" };

export type MediaUsageItem = {
  entityType: string;
  entityId: string;
  field: string;
  /** Human label ("Service: Overseas employment") when the entity is known to this module. */
  label: string;
  href: string | null;
};

export type MediaListItem = {
  id: string;
  kind: MediaKind;
  title: string;
  altText: string | null;
  tags: string[];
  visibility: "public" | "internal";
  status: "active" | "archived";
  consentStatus: ContentConsentStatus;
  showsIdentifiablePeople: boolean | null;
  folderId: string | null;
  thumbnailUrl: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  usageCount: number;
  createdAt: Date;
};

export type AdminAnnouncementItem = {
  id: string;
  title: string;
  status: AnnouncementStatus;
  audience: AnnouncementAudience[];
  placements: AnnouncementPlacement[];
  priority: AnnouncementPriority;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  organizationId: string | null;
  organizationName: string | null;
  updatedAt: Date;
};

export type AdminMetricItem = {
  key: string;
  label: string;
  mode: PublicMetricMode;
  isVisible: boolean;
  definition: string | null;
  isStandard: boolean;
  /** Live counter value (computed now or cached) — shown to staff even when hidden. */
  liveValue: number | null;
  liveValueComputedAt: Date | null;
  manualValue: number | null;
  asOfDate: string | null;
  approvedValue: number | null;
  approvedAsOfDate: string | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  manualApprovalCurrent: boolean;
  evidenceNote: string | null;
  evidenceFileId: string | null;
  minDisplayValue: number | null;
  sortOrder: number;
  /** What the public site shows right now (null = nothing). */
  publicValue: number | null;
};
