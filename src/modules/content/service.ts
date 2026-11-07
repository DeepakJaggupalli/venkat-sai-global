import "server-only";

/**
 * Content module — public write API (server-only). See README.md for signatures and rules.
 * Every function takes the acting staff member's StaffContext (or a partner's OrgContext) and re-checks
 * permissions itself.
 */
export {
  createEntry,
  updateEntry,
  publishEntry,
  requestPublication,
  scheduleEntry,
  unpublishEntry,
  archiveEntry,
  restoreEntry,
  softDeleteEntry,
  rollbackEntry,
  duplicateEntry,
  reorderEntries,
  setEntryFeatured,
  updateEntryConsent,
  setEntryLogoPermission,
  createPreviewLink,
  type ScheduleResult,
} from "./entries";
export {
  createMediaAsset,
  createEmbedAsset,
  updateMediaAsset,
  updateMediaConsent,
  setMediaVisibility,
  archiveMediaAsset,
  restoreMediaAsset,
  deleteMediaAsset,
  createMediaFolder,
  renameMediaFolder,
  moveMediaFolder,
  deleteMediaFolder,
  syncMediaUsages,
  clearMediaUsages,
  mediaUrl,
  type MediaWriteResult,
} from "./media";
export {
  saveAnnouncement,
  publishAnnouncement,
  expireAnnouncement,
  archiveAnnouncement,
  restoreAnnouncement,
  deleteAnnouncement,
  savePartnerAnnouncement,
  withdrawPartnerAnnouncement,
} from "./announcements";
export {
  updatePublicMetric,
  setManualMetricValue,
  approveManualMetricValue,
  createCustomMetric,
  deleteCustomMetric,
  refreshLiveMetrics,
  computeLiveMetric,
  LIVE_METRICS,
} from "./public-metrics";
export { saveLogoPermission, approveLogoPermission, revokeLogoPermission } from "./logo-permissions";
export { signPreviewToken, verifyPreviewToken, type PreviewTokenPayload } from "./preview";
