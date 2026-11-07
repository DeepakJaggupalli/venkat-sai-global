/**
 * Public website content and credibility data.
 * Layer 15 — may import from every earlier layer (taxonomy … notifications); this file only needs core.
 *
 *  - media_folders, media_assets, media_usages: the media library (photos, videos, documents, YouTube/Vimeo
 *    embeds) with consent tracking for photographs of identifiable people (workers, clients, event attendees).
 *  - logo_permissions: evidence that a client / partner allowed Venkat Sai to display its logo (spec 5).
 *  - cms_entries, cms_entry_versions: generic typed CMS collections with drafts, scheduling, history, rollback.
 *  - announcements: banners, tickers and notification-centre posts for the public site and the portals.
 *  - public_metrics: credibility counters (spec 7.3) — live from real tables or manually approved, never invented.
 *
 * Truthfulness and consent rules (docs/CONVENTIONS.md, golden rule 1) are enforced with CHECK constraints
 * wherever a single row can prove them. Time-dependent rules (expiry dates) are applied by the content
 * module's public queries and its `content.publish_scheduled` task.
 *
 * CHECK expressions are written NULL-safe on purpose: PostgreSQL accepts a row when a CHECK evaluates to NULL,
 * so nullable columns are only compared behind `is null` / `is not distinct from` / `coalesce` guards.
 */
import { type SQL, sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { PORTALS } from "./_constants";
import { createdAtOnly, emptyJsonObject, pk, timestamps, tstz, tsvector } from "./_shared";
import { files, organizations, users } from "./core";

// Empty-array defaults are applied by Drizzle at insert time (`$defaultFn(() => [])`), not by the database:
// drizzle-kit 0.31 cannot round-trip an empty-array column default, so `drizzle-kit push` would re-issue
// ALTER COLUMN ... SET DEFAULT on every run (docs/SCHEMA_NOTES.md). Raw SQL inserts must supply these columns.

/**
 * Inlines compile-time constants as an SQL text list inside a CHECK constraint. DDL cannot carry bind
 * parameters, so every value is validated against a strict identifier pattern first (never user input).
 */
function sqlConstList(values: readonly string[]): SQL {
  for (const value of values) {
    if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe constant in CHECK constraint: ${value}`);
  }
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}

// ---------------------------------------------------------------------------
// Consent of the people / organisations featured in content
// ---------------------------------------------------------------------------

/**
 * Consent (or permission) of the identifiable people or organisations featured in a media asset or CMS entry.
 * `obtained` requires a date and evidence: a signed release in files (consentFileId) or a note saying where the
 * evidence is kept. Consent captured on the platform (consent purpose `testimonial_publication` /
 * `media_publication`) is recorded in consent_records with contextType/contextId pointing at the content row.
 */
export const CONTENT_CONSENT_STATUSES = ["not_required", "obtained", "pending", "withdrawn"] as const;
export type ContentConsentStatus = (typeof CONTENT_CONSENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Media library (/admin/media)
// ---------------------------------------------------------------------------

export const MEDIA_KINDS = ["image", "video", "document", "embed"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Embeds are limited to these players (the CSP frame-src must allow the matching embed domains). */
export const MEDIA_EMBED_PROVIDERS = ["youtube", "vimeo"] as const;
export type MediaEmbedProvider = (typeof MEDIA_EMBED_PROVIDERS)[number];

/** public = may be used on public pages (its file is served publicly); internal = staff only. */
export const MEDIA_VISIBILITIES = ["public", "internal"] as const;
export type MediaVisibility = (typeof MEDIA_VISIBILITIES)[number];

export const MEDIA_STATUSES = ["active", "archived"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/**
 * Folders of the media library. Deleting a folder that still has sub-folders is refused (move or delete them
 * first); assets inside a deleted folder become unfiled.
 */
export const mediaFolders = pgTable(
  "media_folders",
  {
    id: pk(),
    name: text().notNull(),
    /** Parent folder; null = top level. */
    parentId: uuid(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: "media_folders_parent_fk" }),
    index("media_folders_parent_idx").on(t.parentId),
    // Sibling names are unique, also at the top level (NULLS NOT DISTINCT semantics through coalesce). An
    // expression index because drizzle-kit 0.31 re-creates `unique().nullsNotDistinct()` on every push; the
    // plain column is written as SQL as well (docs/SCHEMA_NOTES.md).
    uniqueIndex("media_folders_parent_name_uq").on(sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`${t.name}`),
    index("media_folders_created_by_idx").on(t.createdByUserId),
    check("media_folders_name_chk", sql`char_length(btrim(${t.name})) between 1 and 120`),
    check("media_folders_parent_chk", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
);

/**
 * A media library item: an uploaded file (image, video, document) or a YouTube/Vimeo embed, plus the
 * descriptive and accessibility metadata used wherever it appears.
 *
 * Privacy / consent: photographs and videos of workers, clients or event attendees need the consent of the
 * identifiable people shown. `showsIdentifiablePeople` must be answered (null = not yet assessed) before the
 * asset can be public; an asset showing people can only be public while consent is `obtained`; public images
 * need a text alternative (all CHECK constraints). Consent withdrawal = set consentStatus `withdrawn` and
 * visibility `internal` in the same update; the content service also makes the underlying file private and
 * returns the entries listed in media_usages to their editors. Those entries stay published: public queries only
 * resolve public assets, so the withdrawn item disappears from every page at once without taking pages offline.
 * Public use of an asset showing people additionally goes through the approval centre (type media_asset).
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: pk(),
    kind: text({ enum: MEDIA_KINDS }).notNull(),
    /** The uploaded binary (files.purpose = cms_media); null only for embeds. A file cannot be removed while an asset uses it. */
    fileId: uuid().references(() => files.id),
    folderId: uuid().references(() => mediaFolders.id, { onDelete: "set null" }),
    title: text().notNull(),
    /** Text alternative (WCAG 1.1.1). Required before an image is public; an empty string marks a purely decorative image. */
    altText: text(),
    caption: text(),
    description: text(),
    /** Photographer / source credit shown with the asset where required. */
    credit: text(),
    tags: text().array().notNull().$defaultFn(() => []),
    /** kind = embed only. */
    embedProvider: text({ enum: MEDIA_EMBED_PROVIDERS }),
    /** https URL on the provider's domain, normalised by the service to the player URL (e.g. https://www.youtube-nocookie.com/embed/<id>). */
    embedUrl: text(),
    /** Whether identifiable people appear in the asset; null = not yet assessed (cannot be public). */
    showsIdentifiablePeople: boolean(),
    consentStatus: text({ enum: CONTENT_CONSENT_STATUSES }).notNull().default("not_required"),
    /** What the consent covers and where the evidence is kept (e.g. "Signed release; website and brochures"). */
    consentNotes: text(),
    /** Signed release / consent form. Evidence cannot be removed while referenced. */
    consentFileId: uuid().references(() => files.id),
    consentObtainedAt: tstz(),
    /** End of a time-limited release; the content task withdraws public use when it passes. */
    consentExpiresAt: tstz(),
    visibility: text({ enum: MEDIA_VISIBILITIES }).notNull().default("internal"),
    status: text({ enum: MEDIA_STATUSES }).notNull().default("active"),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Media library search over title (A), alt text + caption (B), description + credit (C). */
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple'::regconfig, coalesce(${mediaAssets.title}, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(${mediaAssets.altText}, '') || ' ' || coalesce(${mediaAssets.caption}, '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce(${mediaAssets.description}, '') || ' ' || coalesce(${mediaAssets.credit}, '')), 'C')`,
    ),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    // One asset per uploaded file (also the FK index); embeds have no file and are not constrained.
    uniqueIndex("media_assets_file_uq").on(t.fileId),
    index("media_assets_folder_idx").on(t.folderId),
    index("media_assets_consent_file_idx").on(t.consentFileId),
    index("media_assets_uploaded_by_idx").on(t.uploadedByUserId),
    index("media_assets_library_idx").on(t.status, t.kind, t.createdAt),
    index("media_assets_consent_status_idx").on(t.consentStatus),
    index("media_assets_consent_expires_idx").on(t.consentExpiresAt).where(sql`${t.consentExpiresAt} is not null`),
    index("media_assets_tags_idx").using("gin", t.tags),
    index("media_assets_search_idx").using("gin", t.searchVector),
    check("media_assets_title_chk", sql`btrim(${t.title}) <> ''`),
    // A file XOR an embed.
    check(
      "media_assets_source_chk",
      sql`(${t.kind} = 'embed' and ${t.fileId} is null and ${t.embedProvider} is not null and ${t.embedUrl} is not null) or (${t.kind} <> 'embed' and ${t.fileId} is not null and ${t.embedProvider} is null and ${t.embedUrl} is null)`,
    ),
    check(
      "media_assets_embed_url_chk",
      sql`${t.embedUrl} is null or (${t.embedProvider} is not null and ${t.embedUrl} !~ '[[:space:]]' and char_length(${t.embedUrl}) <= 500 and ((${t.embedProvider} = 'youtube' and ${t.embedUrl} ~ '^https://((www[.])?youtube(-nocookie)?[.]com|youtu[.]be)/') or (${t.embedProvider} = 'vimeo' and ${t.embedUrl} ~ '^https://(player[.])?vimeo[.]com/')))`,
    ),
    // People shown => consent is required (pending / obtained / withdrawn, never not_required).
    check("media_assets_people_consent_chk", sql`${t.showsIdentifiablePeople} is not true or ${t.consentStatus} <> 'not_required'`),
    // Public => assessed for people, consent not outstanding, and images carry a text alternative.
    check(
      "media_assets_public_chk",
      sql`${t.visibility} <> 'public' or (${t.showsIdentifiablePeople} is not null and ${t.consentStatus} in ('not_required', 'obtained') and (${t.kind} <> 'image' or ${t.altText} is not null))`,
    ),
    check(
      "media_assets_consent_evidence_chk",
      sql`${t.consentStatus} <> 'obtained' or (${t.consentObtainedAt} is not null and (${t.consentFileId} is not null or coalesce(btrim(${t.consentNotes}), '') <> ''))`,
    ),
    check(
      "media_assets_consent_dates_chk",
      sql`${t.consentExpiresAt} is null or ${t.consentObtainedAt} is null or ${t.consentExpiresAt} > ${t.consentObtainedAt}`,
    ),
  ],
);

/**
 * Where each media asset is used, maintained by the content service whenever an entity that embeds media is
 * saved. Answers "where is this used?", lets the service refuse to delete assets that are still in use, and
 * lists what to unpublish when consent is withdrawn. entityId is polymorphic (no FK); entityType names the table.
 */
export const mediaUsages = pgTable(
  "media_usages",
  {
    id: pk(),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    /** cms_entry, announcement, logo_permission, course, organization… */
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    /** Field path inside the entity, e.g. "heroAssetId", "seo.ogImageAssetId", "data.gallery". */
    field: text().notNull(),
    ...createdAtOnly,
  },
  (t) => [
    // Idempotent sync; the leading assetId column indexes the FK.
    unique("media_usages_asset_entity_field_uq").on(t.assetId, t.entityType, t.entityId, t.field),
    index("media_usages_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Logo permissions (spec 5: client / partner logos only with permission)
// ---------------------------------------------------------------------------

export const LOGO_PERMISSION_TYPES = ["written_consent", "contract_clause", "email_approval"] as const;
export type LogoPermissionType = (typeof LOGO_PERMISSION_TYPES)[number];

export const LOGO_PERMISSION_STATUSES = ["pending", "approved", "expired", "revoked"] as const;
export type LogoPermissionStatus = (typeof LOGO_PERMISSION_STATUSES)[number];

/** How the organisation relates to Venkat Sai — decides the heading it may appear under (a partner is never shown as a client). */
export const LOGO_RELATIONSHIPS = ["client", "partner", "institution", "accreditation", "membership"] as const;
export type LogoRelationship = (typeof LOGO_RELATIONSHIPS)[number];

/** Where the permission allows the logo to appear (offline_materials = brochures, proposals, presentations). */
export const LOGO_DISPLAY_LOCATIONS = [
  "homepage",
  "clients_page",
  "partners_page",
  "industry_pages",
  "service_pages",
  "case_studies",
  "offline_materials",
] as const;
export type LogoDisplayLocation = (typeof LOGO_DISPLAY_LOCATIONS)[number];

/**
 * Evidence that an organisation allowed Venkat Sai to display its name and logo. A logo may appear publicly
 * only while its permission is `approved`, not past expiresAt, and the location is in displayLocations (the
 * expiry part is checked by the public queries and the content task, which flips the status to `expired`).
 * Approval requires evidence (file or reference), the granting person, the grant date and at least one
 * location (CHECK). Records are kept as evidence: revoke instead of deleting.
 */
export const logoPermissions = pgTable(
  "logo_permissions",
  {
    id: pk(),
    /** Name exactly as it may be displayed (kept even when the organisation has no account). */
    organizationName: text().notNull(),
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    relationship: text({ enum: LOGO_RELATIONSHIPS }).notNull(),
    logoAssetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    permissionType: text({ enum: LOGO_PERMISSION_TYPES }).notNull(),
    /** Signed letter, contract page or saved email. Evidence cannot be removed while referenced. */
    evidenceFileId: uuid().references(() => files.id),
    /** Where the evidence lives when it is not an uploaded file (e.g. contract reference and clause number). */
    evidenceReference: text(),
    /** Person at the organisation who granted permission, and their designation. */
    grantedByName: text(),
    grantedByDesignation: text(),
    grantedAt: tstz(),
    expiresAt: tstz(),
    displayLocations: text({ enum: LOGO_DISPLAY_LOCATIONS }).array().notNull().$defaultFn(() => []),
    /** Usage conditions stated by the grantor (e.g. "monochrome version only", "no link to our website"). */
    conditions: text(),
    status: text({ enum: LOGO_PERMISSION_STATUSES }).notNull().default("pending"),
    /** Staff reviewer. May later become null if that account is erased; approvedAt and audit_logs keep the record. */
    approvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: tstz(),
    revokedAt: tstz(),
    revokedReason: text(),
    /** Internal notes (never shown publicly). */
    notes: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("logo_permissions_org_idx").on(t.organizationId),
    index("logo_permissions_logo_asset_idx").on(t.logoAssetId),
    index("logo_permissions_evidence_file_idx").on(t.evidenceFileId),
    index("logo_permissions_approved_by_idx").on(t.approvedByUserId),
    index("logo_permissions_created_by_idx").on(t.createdByUserId),
    index("logo_permissions_status_expires_idx").on(t.status, t.expiresAt),
    check("logo_permissions_name_chk", sql`btrim(${t.organizationName}) <> ''`),
    check(
      "logo_permissions_approved_chk",
      sql`${t.status} <> 'approved' or (${t.approvedAt} is not null and ${t.grantedAt} is not null and coalesce(btrim(${t.grantedByName}), '') <> '' and (${t.evidenceFileId} is not null or coalesce(btrim(${t.evidenceReference}), '') <> '') and cardinality(${t.displayLocations}) > 0)`,
    ),
    check("logo_permissions_revoked_chk", sql`${t.status} <> 'revoked' or ${t.revokedAt} is not null`),
    check("logo_permissions_dates_chk", sql`${t.expiresAt} is null or ${t.grantedAt} is null or ${t.expiresAt} > ${t.grantedAt}`),
  ],
);

// ---------------------------------------------------------------------------
// CMS (generic typed collections + versions)
// ---------------------------------------------------------------------------

/**
 * Collections holding exactly one entry per locale (site-wide settings, layout and the About page).
 * Footer link columns live in `navigation` and the footer text in `site_settings`, so there is no separate
 * footer singleton. A singleton's slug is its collection key with "_" replaced by "-" (e.g. "site-settings").
 * TS-only enum (text column): changing this list needs no migration.
 */
export const CMS_SINGLETON_COLLECTIONS = ["site_settings", "homepage", "navigation", "about"] as const;
export type CmsSingletonCollection = (typeof CMS_SINGLETON_COLLECTIONS)[number];

/**
 * Every CMS collection. Each has a zod schema for `data` in src/modules/content.
 * destinations = overseas employment countries; pages = legal and static pages.
 */
export const CMS_COLLECTIONS = [
  "services",
  "industries",
  "destinations",
  "case_studies",
  "testimonials",
  "faqs",
  "news",
  "blog_posts",
  "events",
  "gallery_albums",
  "videos",
  "pages",
  "team_members",
  "client_logos",
  ...CMS_SINGLETON_COLLECTIONS,
] as const;
export type CmsCollection = (typeof CMS_COLLECTIONS)[number];

/** Collections that feature identifiable people or organisations: publishing requires consentStatus = obtained (CHECK). */
export const CMS_CONSENT_REQUIRED_COLLECTIONS = ["testimonials", "case_studies", "team_members"] as const satisfies readonly CmsCollection[];

export const CMS_ENTRY_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type CmsEntryStatus = (typeof CMS_ENTRY_STATUSES)[number];

/** SEO metadata of a CMS entry (and its versions). */
export type CmsSeo = {
  title?: string;
  description?: string;
  /** media_assets.id of the Open Graph / social preview image. */
  ogImageAssetId?: string;
  noindex?: boolean;
  /** Absolute canonical URL when the content is also published elsewhere. */
  canonicalUrl?: string;
};

/**
 * A CMS entry of any collection (non-technical admins manage every public page). `collection` selects the zod
 * schema that validates `data`; translations of one item share collection + slug and differ by locale.
 *
 * Versioning model (drafts never leak to the public site or to search):
 *  - Every save writes a cms_entry_versions row and bumps currentVersion.
 *  - Until the first publication the row mirrors the latest version. Once published, the row holds exactly what
 *    the public site renders (publishedVersion); later edits stay in cms_entry_versions
 *    (currentVersion > publishedVersion = unpublished changes) until they are published — directly, through an
 *    approval, or at publishAt (scheduledVersion) — which copies that version onto the row.
 *  - Rollback = copy an older version into a new version and publish it.
 *
 * Consent: testimonials, case studies and team members cannot be published or scheduled unless consentStatus is
 * `obtained` with evidence; client_logos entries need a logo_permissions record (its approval and expiry are
 * checked by the public queries). Consent withdrawal = set status `archived` and consentStatus `withdrawn` in one
 * update. Soft-deleted entries keep their slug (restorable); the service renames a deleted entry's slug when the
 * slug has to be reused.
 */
export const cmsEntries = pgTable(
  "cms_entries",
  {
    id: pk(),
    collection: text({ enum: CMS_COLLECTIONS }).notNull(),
    /** URL segment(s): lower-case kebab-case, optionally nested with "/" (e.g. "legal/privacy-notice"). */
    slug: text().notNull(),
    /** Content language as a BCP-47 tag ("en", "hi", "te"). */
    locale: text().notNull().default("en"),
    title: text().notNull(),
    summary: text(),
    /** Collection-specific fields, validated per collection in code; rich text inside is sanitised on write. */
    data: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    seo: jsonb().$type<CmsSeo>().notNull().default(emptyJsonObject),
    status: text({ enum: CMS_ENTRY_STATUSES }).notNull().default("draft"),
    /** When scheduledVersion goes live: status is `scheduled` for a first publication and stays `published` for a scheduled update. */
    publishAt: tstz(),
    /** When the entry is archived automatically (e.g. an event page or time-bound news). */
    unpublishAt: tstz(),
    publishedAt: tstz(),
    /** Version currently live (copied onto this row); null = never published. */
    publishedVersion: integer(),
    /** Latest saved version. */
    currentVersion: integer().notNull().default(1),
    /** Version to publish at publishAt (pinned, so later edits are not published unreviewed). */
    scheduledVersion: integer(),
    sortOrder: integer().notNull().default(0),
    isFeatured: boolean().notNull().default(false),
    tags: text().array().notNull().$defaultFn(() => []),
    heroAssetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    /** client_logos entries: the permission evidence that allows the logo to be shown (kept while referenced). */
    logoPermissionId: uuid().references(() => logoPermissions.id),
    /** Consent of the people / organisation featured (see CMS_CONSENT_REQUIRED_COLLECTIONS). */
    consentStatus: text({ enum: CONTENT_CONSENT_STATUSES }).notNull().default("not_required"),
    consentNotes: text(),
    /** Signed release / written permission. Evidence cannot be removed while referenced. */
    consentFileId: uuid().references(() => files.id),
    consentObtainedAt: tstz(),
    /** End of a time-limited consent; the content task archives the entry when it passes. */
    consentExpiresAt: tstz(),
    /**
     * Plain text extracted from `data` (body copy, FAQ answers, tags…) by the content service whenever the row's
     * content changes (i.e. on publish, or on save before the first publication). Feeds searchVector.
     */
    searchText: text(),
    /** Site search over title (A), summary (B) and searchText (C). */
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple'::regconfig, coalesce(${cmsEntries.title}, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(${cmsEntries.summary}, '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce(${cmsEntries.searchText}, '')), 'C')`,
    ),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    publishedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    unique("cms_entries_collection_slug_locale_uq").on(t.collection, t.slug, t.locale),
    index("cms_entries_listing_idx").on(t.collection, t.locale, t.status, t.sortOrder).where(sql`${t.deletedAt} is null`),
    index("cms_entries_publish_at_idx").on(t.publishAt).where(sql`${t.publishAt} is not null`),
    index("cms_entries_unpublish_at_idx").on(t.unpublishAt).where(sql`${t.unpublishAt} is not null`),
    index("cms_entries_consent_expires_idx").on(t.consentExpiresAt).where(sql`${t.consentExpiresAt} is not null`),
    index("cms_entries_tags_idx").using("gin", t.tags),
    index("cms_entries_search_idx").using("gin", t.searchVector),
    index("cms_entries_hero_asset_idx").on(t.heroAssetId),
    index("cms_entries_logo_permission_idx").on(t.logoPermissionId),
    index("cms_entries_consent_file_idx").on(t.consentFileId),
    index("cms_entries_created_by_idx").on(t.createdByUserId),
    index("cms_entries_updated_by_idx").on(t.updatedByUserId),
    index("cms_entries_published_by_idx").on(t.publishedByUserId),
    check(
      "cms_entries_slug_chk",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$' and char_length(${t.slug}) <= 200`,
    ),
    check("cms_entries_locale_chk", sql`${t.locale} ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'`),
    check("cms_entries_title_chk", sql`btrim(${t.title}) <> ''`),
    check("cms_entries_json_chk", sql`jsonb_typeof(${t.data}) = 'object' and jsonb_typeof(${t.seo}) = 'object'`),
    check(
      "cms_entries_versions_chk",
      sql`${t.currentVersion} >= 1 and (${t.publishedVersion} is null or ${t.publishedVersion} between 1 and ${t.currentVersion}) and (${t.scheduledVersion} is null or (${t.scheduledVersion} between 1 and ${t.currentVersion} and ${t.publishAt} is not null))`,
    ),
    check(
      "cms_entries_status_chk",
      sql`(${t.status} <> 'scheduled' or ${t.scheduledVersion} is not null) and (${t.status} <> 'published' or (${t.publishedAt} is not null and ${t.publishedVersion} is not null))`,
    ),
    check("cms_entries_window_chk", sql`${t.unpublishAt} is null or ${t.publishAt} is null or ${t.unpublishAt} > ${t.publishAt}`),
    check(
      "cms_entries_consent_evidence_chk",
      sql`${t.consentStatus} <> 'obtained' or (${t.consentObtainedAt} is not null and (${t.consentFileId} is not null or coalesce(btrim(${t.consentNotes}), '') <> ''))`,
    ),
    check(
      "cms_entries_consent_dates_chk",
      sql`${t.consentExpiresAt} is null or ${t.consentObtainedAt} is null or ${t.consentExpiresAt} > ${t.consentObtainedAt}`,
    ),
    check(
      "cms_entries_consent_required_chk",
      sql`${t.collection} not in (${sqlConstList(CMS_CONSENT_REQUIRED_COLLECTIONS)}) or ${t.status} not in ('published', 'scheduled') or ${t.consentStatus} = 'obtained'`,
    ),
    check(
      "cms_entries_logo_permission_chk",
      sql`${t.collection} <> 'client_logos' or ${t.status} not in ('published', 'scheduled') or ${t.logoPermissionId} is not null`,
    ),
  ],
);

/**
 * Immutable snapshot written on every save of a CMS entry: history, preview of drafts, approval of a specific
 * version and rollback. Append-only (never updated by the application). Holds the versioned fields only;
 * operational fields (status, schedule, ordering, featuring, consent) live on cms_entries.
 */
export const cmsEntryVersions = pgTable(
  "cms_entry_versions",
  {
    id: pk(),
    entryId: uuid()
      .notNull()
      .references(() => cmsEntries.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    summary: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    seo: jsonb().$type<CmsSeo>().notNull().default(emptyJsonObject),
    tags: text().array().notNull().$defaultFn(() => []),
    heroAssetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    /** Editor's change note ("Updated eligibility section", "Restored version 3"). */
    note: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...createdAtOnly,
  },
  (t) => [
    // The leading entryId column indexes the FK.
    unique("cms_entry_versions_entry_version_uq").on(t.entryId, t.version),
    index("cms_entry_versions_hero_asset_idx").on(t.heroAssetId),
    index("cms_entry_versions_created_by_idx").on(t.createdByUserId),
    check("cms_entry_versions_version_chk", sql`${t.version} >= 1`),
    check("cms_entry_versions_json_chk", sql`jsonb_typeof(${t.data}) = 'object' and jsonb_typeof(${t.seo}) = 'object'`),
  ],
);

// ---------------------------------------------------------------------------
// Announcements (/admin/announcements)
// ---------------------------------------------------------------------------

/** Portals an announcement targets ("all" = everyone). */
export const ANNOUNCEMENT_AUDIENCES = [...PORTALS, "all"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_PLACEMENTS = ["homepage_banner", "portal_banner", "notification_centre", "ticker"] as const;
export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];

export const ANNOUNCEMENT_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "published", "expired", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/**
 * Banners, tickers and notification-centre posts for the public site and/or portals. Shown while status is
 * `published` and now is within [startsAt, endsAt). organizationId is set when a partner organisation requested
 * the announcement (approval type `partner_announcement`); null = Venkat Sai. Broadcasts are never fanned out as
 * per-user notifications: banners and notification centres read the active announcements at render time, so the
 * content service always stores sendNotification = false (the column is kept for a possible targeted use later).
 * The body is plain text rendered escaped — never HTML; links are site-relative paths or http(s) URLs only (CHECK).
 */
export const announcements = pgTable(
  "announcements",
  {
    id: pk(),
    title: text().notNull(),
    /** Plain text, rendered escaped; keep it short for banners and tickers. */
    body: text(),
    audience: text({ enum: ANNOUNCEMENT_AUDIENCES }).array().notNull(),
    placements: text({ enum: ANNOUNCEMENT_PLACEMENTS }).array().notNull(),
    priority: text({ enum: ANNOUNCEMENT_PRIORITIES }).notNull().default("normal"),
    /** Site-relative path ("/jobs") or absolute http(s) URL. */
    linkUrl: text(),
    linkLabel: text(),
    startsAt: tstz(),
    endsAt: tstz(),
    status: text({ enum: ANNOUNCEMENT_STATUSES }).notNull().default("draft"),
    /** Whether viewers may dismiss it (critical notices can be made non-dismissible). */
    isDismissible: boolean().notNull().default(true),
    sendNotification: boolean().notNull().default(false),
    notificationSentAt: tstz(),
    /** Requesting partner organisation; its announcements go with it. */
    organizationId: uuid().references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    publishedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    publishedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("announcements_status_starts_idx").on(t.status, t.startsAt),
    index("announcements_status_ends_idx").on(t.status, t.endsAt),
    index("announcements_audience_idx").using("gin", t.audience),
    index("announcements_org_idx").on(t.organizationId),
    index("announcements_created_by_idx").on(t.createdByUserId),
    index("announcements_updated_by_idx").on(t.updatedByUserId),
    index("announcements_published_by_idx").on(t.publishedByUserId),
    check("announcements_title_chk", sql`btrim(${t.title}) <> ''`),
    check("announcements_targets_chk", sql`cardinality(${t.audience}) > 0 and cardinality(${t.placements}) > 0`),
    check("announcements_window_chk", sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      "announcements_status_chk",
      sql`(${t.status} <> 'scheduled' or ${t.startsAt} is not null) and (${t.status} <> 'published' or ${t.publishedAt} is not null)`,
    ),
    // No javascript:/data: links and no protocol-relative ("//host", "/\host") URLs.
    check(
      "announcements_link_chk",
      sql`${t.linkUrl} is null or ((${t.linkUrl} ~ '^https?://[^/[:space:]]' or (left(${t.linkUrl}, 1) = '/' and left(${t.linkUrl}, 2) not in ('//', '/' || chr(92)))) and ${t.linkUrl} !~ '[[:space:]]' and char_length(${t.linkUrl}) <= 2048)`,
    ),
    check("announcements_link_label_chk", sql`${t.linkLabel} is null or ${t.linkUrl} is not null`),
    check("announcements_notification_chk", sql`${t.notificationSentAt} is null or ${t.sendNotification}`),
  ],
);

// ---------------------------------------------------------------------------
// Public metrics (spec 7.3 credibility counters)
// ---------------------------------------------------------------------------

/** Standard counters; admins may add `custom_<name>` keys. */
export const PUBLIC_METRIC_KEYS = [
  "registered_candidates",
  "verified_candidates",
  "active_employers",
  "employer_partners",
  "recruitment_partners",
  "training_partners",
  "jobs_facilitated",
  "successful_placements",
  "active_countries",
  "training_programmes",
  "internship_opportunities",
] as const;
export type StandardPublicMetricKey = (typeof PUBLIC_METRIC_KEYS)[number];
export type PublicMetricKey = StandardPublicMetricKey | `custom_${string}`;

export const PUBLIC_METRIC_MODES = ["live", "manual", "hidden"] as const;
export type PublicMetricMode = (typeof PUBLIC_METRIC_MODES)[number];

/**
 * Credibility counters shown on the public site (e.g. "registered candidates"). Never invented:
 *  - mode `live`: computed in code from real tables by the counter named in liveQueryKey (cached in liveValue);
 *  - mode `manual`: a staff-entered value that must be approved. Approval stores a snapshot of the exact
 *    manualValue + asOfDate (approvedValue, approvedAsOfDate, approvedAt, approvedByUserId);
 *  - mode `hidden`: never shown.
 *
 * Display guarantee (CHECK public_metrics_display_chk): a row with isVisible = true and mode <> 'hidden' MUST
 * have a public definition and be either live, or manual with recorded evidence and an approval snapshot equal to
 * the current manualValue/asOfDate. Editing an approved manual value therefore requires hiding it or re-approving
 * it in the same update. The public query is simply `isVisible and mode <> 'hidden'` (plus the minDisplayValue
 * threshold), and manual values are always displayed with their "as of" date.
 */
export const publicMetrics = pgTable(
  "public_metrics",
  {
    id: pk(),
    key: text().$type<PublicMetricKey>().notNull(),
    /** Public label ("Registered candidates"). */
    label: text().notNull(),
    mode: text({ enum: PUBLIC_METRIC_MODES }).notNull().default("hidden"),
    /** Code-defined live counter (src/modules/content) computed from real tables; required for mode = live. */
    liveQueryKey: text(),
    /** Last value computed by the live counter (cache refreshed by the content module) and when. */
    liveValue: bigint({ mode: "number" }),
    liveValueComputedAt: tstz(),
    /** Staff-entered value (mode = manual). Changing it invalidates the approval snapshot. */
    manualValue: bigint({ mode: "number" }),
    /** Date on which manualValue was true; shown publicly next to the number ("as of …"). */
    asOfDate: date({ mode: "string" }),
    /** Public explanation of exactly what is counted (shown on hover / info tooltip). */
    definition: text(),
    /** Internal: how the manual value was verified (source records, method). Never shown publicly. */
    evidenceNote: text(),
    evidenceFileId: uuid().references(() => files.id),
    /** Approval snapshot: the exact manualValue and asOfDate that were approved. */
    approvedValue: bigint({ mode: "number" }),
    approvedAsOfDate: date({ mode: "string" }),
    /** Staff approver. May later become null if that account is erased; approvedAt and audit_logs keep the record. */
    approvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: tstz(),
    /** The counter stays hidden while its value is below this threshold; null = no threshold. */
    minDisplayValue: bigint({ mode: "number" }),
    sortOrder: integer().notNull().default(0),
    isVisible: boolean().notNull().default(false),
    updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("public_metrics_key_uq").on(t.key),
    index("public_metrics_evidence_file_idx").on(t.evidenceFileId),
    index("public_metrics_approved_by_idx").on(t.approvedByUserId),
    index("public_metrics_updated_by_idx").on(t.updatedByUserId),
    check("public_metrics_key_chk", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,62}$'`),
    check("public_metrics_label_chk", sql`btrim(${t.label}) <> ''`),
    check(
      "public_metrics_values_chk",
      sql`coalesce(${t.manualValue}, 0) >= 0 and coalesce(${t.approvedValue}, 0) >= 0 and coalesce(${t.liveValue}, 0) >= 0 and coalesce(${t.minDisplayValue}, 0) >= 0`,
    ),
    check("public_metrics_live_chk", sql`${t.mode} <> 'live' or ${t.liveQueryKey} is not null`),
    check("public_metrics_manual_chk", sql`${t.mode} <> 'manual' or (${t.manualValue} is not null and ${t.asOfDate} is not null)`),
    // The approval snapshot is all-or-nothing.
    check(
      "public_metrics_approval_chk",
      sql`(${t.approvedAt} is null) = (${t.approvedValue} is null) and (${t.approvedAt} is null) = (${t.approvedAsOfDate} is null)`,
    ),
    check(
      "public_metrics_display_chk",
      sql`not ${t.isVisible} or ${t.mode} = 'hidden' or (coalesce(btrim(${t.definition}), '') <> '' and (${t.mode} = 'live' or (${t.approvedAt} is not null and ${t.approvedValue} is not distinct from ${t.manualValue} and ${t.approvedAsOfDate} is not distinct from ${t.asOfDate} and (${t.evidenceFileId} is not null or coalesce(btrim(${t.evidenceNote}), '') <> ''))))`,
    ),
  ],
);
