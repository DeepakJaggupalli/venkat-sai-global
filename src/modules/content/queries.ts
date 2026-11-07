import "server-only";

/**
 * Content module — public read API (server-only). See README.md.
 *  - Public site: published content only (plus drafts behind a valid preview token).
 *  - Command Centre: every status, version history and diffs (StaffContext required).
 */
export {
  getSingleton,
  getSingletonData,
  getPublishedEntries,
  getPublishedEntryBySlug,
  getPublishedEntriesByIds,
  getPublishedSlugs,
  searchContent,
  resolvePreviewTarget,
  type PublicReadOptions,
  type PublishedListOptions,
} from "./public-queries";
export {
  listEntries,
  getEntryDetail,
  getSingletonForEditing,
  getEntryVersion,
  compareEntryVersions,
  listReferenceOptions,
  listCollectionsOverview,
  listScheduledContent,
  listEntryTags,
  type CollectionOverview,
  type ScheduledContentItem,
} from "./admin-queries";
export {
  listMediaAssets,
  getMediaAsset,
  listMediaFolders,
  listMediaTags,
  listAssetUsages,
  countMediaNeedingConsent,
  resolvePublicAssets,
  type MediaAssetDetail,
  type MediaFolderItem,
} from "./media";
export { getActiveAnnouncements, toBannerAnnouncement, listAnnouncements, getAnnouncement, listPartnerAnnouncements } from "./announcements";
export { getPublicMetrics, listMetricConfigs } from "./public-metrics";
export { listLogoPermissions, getLogoPermission, listUsableLogoPermissions, type LogoPermissionListItem } from "./logo-permissions";
