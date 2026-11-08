/**
 * Content module labels and value lists (client-safe: the admin editor, badges and services share them).
 *
 * Value lists are derived from label maps typed against the schema enums (type-only imports, so this file
 * never pulls Drizzle into a client bundle). `constants.test.ts` checks that they stay identical to the
 * schema's runtime lists.
 */
import type {
  AnnouncementAudience,
  AnnouncementPlacement,
  AnnouncementPriority,
  AnnouncementStatus,
  CmsCollection,
  CmsEntryStatus,
  CmsSingletonCollection,
  ContentConsentStatus,
  LogoDisplayLocation,
  LogoPermissionStatus,
  LogoPermissionType,
  LogoRelationship,
  MediaEmbedProvider,
  MediaKind,
  MediaStatus,
  MediaVisibility,
  PublicMetricMode,
  StandardPublicMetricKey,
} from "@/db/schema";
import type { MarketRegion } from "@/db/schema/_constants";

const keysOf = <K extends string>(record: Record<K, string>): [K, ...K[]] => Object.keys(record) as [K, ...K[]];

// ---------------------------------------------------------------------------
// CMS
// ---------------------------------------------------------------------------

export const CMS_COLLECTION_LABELS = {
  services: "Services",
  industries: "Industries",
  destinations: "Destinations",
  case_studies: "Case studies",
  testimonials: "Testimonials",
  faqs: "FAQs",
  news: "News",
  blog_posts: "Blog posts",
  events: "Events",
  gallery_albums: "Gallery albums",
  videos: "Videos",
  pages: "Pages",
  team_members: "Team members",
  client_logos: "Client logos",
  requirement_posts: "Requirement posters",
  site_settings: "Site settings",
  homepage: "Homepage",
  navigation: "Navigation",
  about: "About page",
} as const satisfies Record<CmsCollection, string>;

export const CMS_COLLECTION_VALUES = keysOf(CMS_COLLECTION_LABELS);

export const CMS_SINGLETON_LABELS = {
  site_settings: "Site settings",
  homepage: "Homepage",
  navigation: "Navigation",
  about: "About page",
} as const satisfies Record<CmsSingletonCollection, string>;

export const CMS_SINGLETON_VALUES = keysOf(CMS_SINGLETON_LABELS);

/** Fixed slug of a singleton entry ("site_settings" → "site-settings"). */
export function singletonSlug(collection: CmsSingletonCollection): string {
  return collection.replace(/_/g, "-");
}

export function isSingletonCollection(collection: string): collection is CmsSingletonCollection {
  return (CMS_SINGLETON_VALUES as readonly string[]).includes(collection);
}

export const CMS_ENTRY_STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
} as const satisfies Record<CmsEntryStatus, string>;

export const CMS_ENTRY_STATUS_VALUES = keysOf(CMS_ENTRY_STATUS_LABELS);

export const CONTENT_CONSENT_STATUS_LABELS = {
  not_required: "Not required",
  obtained: "Obtained",
  pending: "Pending",
  withdrawn: "Withdrawn",
} as const satisfies Record<ContentConsentStatus, string>;

export const CONTENT_CONSENT_STATUS_VALUES = keysOf(CONTENT_CONSENT_STATUS_LABELS);

/** Content languages offered by the editor (BCP-47). Public pages are English first. */
export const CONTENT_LOCALE_LABELS = { en: "English", hi: "Hindi", te: "Telugu" } as const;
export type ContentLocale = keyof typeof CONTENT_LOCALE_LABELS;
export const CONTENT_LOCALE_VALUES = keysOf(CONTENT_LOCALE_LABELS);
export const DEFAULT_CONTENT_LOCALE: ContentLocale = "en";

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

export const MEDIA_KIND_LABELS = {
  image: "Image",
  video: "Video file",
  document: "Document",
  embed: "Video embed",
} as const satisfies Record<MediaKind, string>;

export const MEDIA_KIND_VALUES = keysOf(MEDIA_KIND_LABELS);

export const MEDIA_EMBED_PROVIDER_LABELS = { youtube: "YouTube", vimeo: "Vimeo" } as const satisfies Record<MediaEmbedProvider, string>;
export const MEDIA_EMBED_PROVIDER_VALUES = keysOf(MEDIA_EMBED_PROVIDER_LABELS);

export const MEDIA_VISIBILITY_LABELS = {
  public: "Public (may appear on the website)",
  internal: "Internal (staff only)",
} as const satisfies Record<MediaVisibility, string>;

export const MEDIA_VISIBILITY_VALUES = keysOf(MEDIA_VISIBILITY_LABELS);

export const MEDIA_STATUS_LABELS = { active: "Active", archived: "Archived" } as const satisfies Record<MediaStatus, string>;
export const MEDIA_STATUS_VALUES = keysOf(MEDIA_STATUS_LABELS);

// ---------------------------------------------------------------------------
// Logo permissions
// ---------------------------------------------------------------------------

export const LOGO_RELATIONSHIP_LABELS = {
  client: "Client",
  partner: "Partner",
  institution: "Institution",
  accreditation: "Accreditation",
  membership: "Membership",
} as const satisfies Record<LogoRelationship, string>;

export const LOGO_RELATIONSHIP_VALUES = keysOf(LOGO_RELATIONSHIP_LABELS);

export const LOGO_PERMISSION_TYPE_LABELS = {
  written_consent: "Written consent",
  contract_clause: "Contract clause",
  email_approval: "Email approval",
} as const satisfies Record<LogoPermissionType, string>;

export const LOGO_PERMISSION_TYPE_VALUES = keysOf(LOGO_PERMISSION_TYPE_LABELS);

export const LOGO_PERMISSION_STATUS_LABELS = {
  pending: "Pending review",
  approved: "Approved",
  expired: "Expired",
  revoked: "Revoked",
} as const satisfies Record<LogoPermissionStatus, string>;

export const LOGO_PERMISSION_STATUS_VALUES = keysOf(LOGO_PERMISSION_STATUS_LABELS);

export const LOGO_DISPLAY_LOCATION_LABELS = {
  homepage: "Homepage",
  clients_page: "Clients page",
  partners_page: "Partners page",
  industry_pages: "Industry pages",
  service_pages: "Service pages",
  case_studies: "Case studies",
  offline_materials: "Offline materials (brochures, proposals)",
} as const satisfies Record<LogoDisplayLocation, string>;

export const LOGO_DISPLAY_LOCATION_VALUES = keysOf(LOGO_DISPLAY_LOCATION_LABELS);

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_AUDIENCE_LABELS = {
  public: "Public website",
  talent: "People Portal (candidates)",
  employer: "Employer Portal",
  recruiter: "Recruitment Partner Portal",
  institution: "Institution Portal",
  admin: "Command Centre (staff)",
  all: "Everyone",
} as const satisfies Record<AnnouncementAudience, string>;

export const ANNOUNCEMENT_AUDIENCE_VALUES = keysOf(ANNOUNCEMENT_AUDIENCE_LABELS);

export const ANNOUNCEMENT_PLACEMENT_LABELS = {
  homepage_banner: "Homepage banner",
  portal_banner: "Portal banner",
  notification_centre: "Notification centre",
  ticker: "Ticker",
} as const satisfies Record<AnnouncementPlacement, string>;

export const ANNOUNCEMENT_PLACEMENT_VALUES = keysOf(ANNOUNCEMENT_PLACEMENT_LABELS);

export const ANNOUNCEMENT_PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
} as const satisfies Record<AnnouncementPriority, string>;

export const ANNOUNCEMENT_PRIORITY_VALUES = keysOf(ANNOUNCEMENT_PRIORITY_LABELS);

export const ANNOUNCEMENT_STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  expired: "Expired",
  archived: "Archived",
} as const satisfies Record<AnnouncementStatus, string>;

export const ANNOUNCEMENT_STATUS_VALUES = keysOf(ANNOUNCEMENT_STATUS_LABELS);

/** What a partner organisation may target when it requests an announcement (staff can widen it on review). */
export const PARTNER_ANNOUNCEMENT_AUDIENCES = ["public", "talent"] as const satisfies readonly AnnouncementAudience[];
export const PARTNER_ANNOUNCEMENT_PLACEMENTS = ["notification_centre", "ticker", "portal_banner"] as const satisfies readonly AnnouncementPlacement[];
export const PARTNER_ANNOUNCEMENT_PRIORITIES = ["low", "normal"] as const satisfies readonly AnnouncementPriority[];

// ---------------------------------------------------------------------------
// Public metrics
// ---------------------------------------------------------------------------

export const PUBLIC_METRIC_MODE_LABELS = {
  live: "Live (computed from platform records)",
  manual: "Manual (approved figure with an as-of date)",
  hidden: "Hidden",
} as const satisfies Record<PublicMetricMode, string>;

export const PUBLIC_METRIC_MODE_VALUES = keysOf(PUBLIC_METRIC_MODE_LABELS);

export const STANDARD_PUBLIC_METRIC_LABELS = {
  registered_candidates: "Registered candidates",
  verified_candidates: "Verified candidates",
  active_employers: "Active employers",
  employer_partners: "Employer partners",
  recruitment_partners: "Recruitment partners",
  training_partners: "Training partners",
  jobs_facilitated: "Jobs facilitated",
  successful_placements: "Successful placements",
  active_countries: "Active countries",
  training_programmes: "Training programmes",
  internship_opportunities: "Internship opportunities",
} as const satisfies Record<StandardPublicMetricKey, string>;

export const STANDARD_PUBLIC_METRIC_VALUES = keysOf(STANDARD_PUBLIC_METRIC_LABELS);

/** Custom metric keys: `custom_` + lower-case letters, digits and underscores (public_metrics_key_chk). */
export const CUSTOM_METRIC_KEY_PATTERN = /^custom_[a-z0-9_]{1,55}$/;

// ---------------------------------------------------------------------------
// Taxonomy-linked values used by collection fields
// ---------------------------------------------------------------------------

export const MARKET_REGION_LABELS = {
  india: "India",
  gcc: "GCC",
  middle_east: "Middle East (other)",
  europe: "Europe",
  asia_pacific: "Asia-Pacific",
  africa: "Africa",
  north_america: "North America",
  latin_america: "Latin America",
  oceania: "Oceania",
} as const satisfies Record<MarketRegion, string>;

export const MARKET_REGION_VALUES = keysOf(MARKET_REGION_LABELS);

/** Mirrors operations ENQUIRY_TYPES (checked in constants.test.ts): the enquiry form a service page opens. */
export const ENQUIRY_TYPE_OPTION_LABELS = {
  general: "General enquiry",
  employer: "Employer / hiring enquiry",
  partner: "Recruitment partner enquiry",
  institution: "Institution / training partner enquiry",
  candidate_support: "Candidate support",
  media: "Media enquiry",
  grievance: "Grievance",
  careers: "Careers at Venkat Sai",
} as const;

export const ENQUIRY_TYPE_OPTION_VALUES = keysOf(ENQUIRY_TYPE_OPTION_LABELS);

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Preview links: default and maximum lifetime. */
export const PREVIEW_TOKEN_DEFAULT_MINUTES = 60;
export const PREVIEW_TOKEN_MAX_MINUTES = 24 * 60;

/** Live public metric values are recomputed when older than this. */
export const LIVE_METRIC_MAX_AGE_MINUTES = 60;

/** Window of "active employers": verified employers with a job published within this many days. */
export const ACTIVE_EMPLOYER_WINDOW_DAYS = 90;
