/**
 * Command Centre routes of the content module (client-safe). The admin UI implements these paths;
 * approval handlers, notifications and media "where used" lists link to them.
 */
import type { CmsCollection } from "@/db/schema";

export const CONTENT_ADMIN_PATHS = {
  content: "/admin/content",
  collection: (collection: CmsCollection) => `/admin/content/${collection}`,
  entry: (collection: CmsCollection, entryId: string) => `/admin/content/${collection}/${entryId}`,
  logoPermissions: "/admin/content/logo-permissions",
  logoPermission: (id: string) => `/admin/content/logo-permissions/${id}`,
  media: "/admin/media",
  mediaAsset: (id: string) => `/admin/media/${id}`,
  announcements: "/admin/announcements",
  announcement: (id: string) => `/admin/announcements/${id}`,
  publicMetrics: "/admin/public-metrics",
} as const;

/** Where partner organisations manage their announcement requests (portal pages are built by the portal teams). */
export const PARTNER_ANNOUNCEMENT_PATHS = {
  employer: "/employer/announcements",
  recruitment_partner: "/recruiter/announcements",
  institution: "/institution/announcements",
} as const;

/** Query parameter the public pages read the preview token from. */
export const PREVIEW_QUERY_PARAM = "preview";

/** Public URL of an entry preview (path + ?preview=<token>). */
export function previewUrl(path: string, token: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${PREVIEW_QUERY_PARAM}=${encodeURIComponent(token)}`;
}
