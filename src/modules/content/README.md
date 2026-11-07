# Content module (`src/modules/content`)

The CMS behind the public website and the credibility data shown on it: typed collections with drafts,
versions, scheduling, preview links and rollback; the media library with consent tracking; announcements;
logo permissions; and public metrics that can only show live counts or approved figures. Owner: core:content.

Schema: `src/db/schema/content.ts` (8 tables — see docs/SCHEMA_NOTES.md §4.11). Admin routes (built by the
admin UI team, constants in `links.ts`): `/admin/content`, `/admin/content/<collection>/<id>`,
`/admin/content/logo-permissions[/<id>]`, `/admin/media[/<id>]`, `/admin/announcements[/<id>]`, `/admin/public-metrics`.

| File | Contents | Runtime |
|---|---|---|
| `fields.ts` | Field descriptors + builders (`field.text()` …), zod generation (`buildObjectSchema`), `DataOf<>` types | client-safe |
| `collections.ts` | The collection registry `COLLECTIONS`, `CollectionData<K>`, validation, editor descriptors, public paths | client-safe |
| `constants.ts` | Labels and value lists (statuses, kinds, audiences, locations, metric keys…), limits | client-safe |
| `schemas.ts` | zod input schemas for every action | client-safe |
| `types.ts` | DTOs (`PublishedEntry`, `PublicMediaAsset`, `AdminEntryDetail`, `PublicMetric`…) | client-safe |
| `embeds.ts` | `parseVideoEmbedUrl`, `isAllowedMapEmbedUrl`, `isSafeLink` | client-safe |
| `field-walk.ts`, `versioning.ts`, `metric-rules.ts` | Pure rules (data walkers, version/state rules, diff, metric display rules) | client-safe |
| `links.ts` | Admin paths, `previewUrl()`, `PREVIEW_QUERY_PARAM` | client-safe |
| `service.ts` | **Write API** (barrel over `entries.ts`, `media.ts`, `announcements.ts`, `public-metrics.ts`, `logo-permissions.ts`, `preview.ts`) | server-only |
| `queries.ts` | **Read API** (barrel over `public-queries.ts`, `admin-queries.ts`, `media.ts`, `announcements.ts`, `public-metrics.ts`, `logo-permissions.ts`) | server-only |
| `actions.ts` | Server Actions for the Command Centre and partner portals | `"use server"` |
| `tasks.ts`, `scheduled.ts` | `content.publish_scheduled`, `content.refresh_public_metrics` | server-only |
| `approval-handlers.ts` | testimonial, case_study, content_publication, media_asset, partner_announcement | server-only |
| `seed.ts`, `seed-content/*` | Idempotent production seed | server-only |

## 1. Collections (`collections.ts`, client-safe)

18 collections. Singletons (one entry per language, fixed slug = key with `-`): `site_settings`, `homepage`,
`navigation`, `about`. Collections: `services`, `industries`, `destinations`, `case_studies`, `testimonials`,
`faqs`, `news`, `blog_posts`, `events`, `gallery_albums`, `videos`, `pages`, `team_members`, `client_logos`.

Every entry has common columns edited by the generic editor: `title`, `slug`, `summary`, `seo`
(`title`, `description`, `ogImageAssetId`, `noindex`, `canonicalUrl`), `tags`, `heroAssetId`, plus operational
fields (`sortOrder`, `isFeatured`, schedule, consent evidence). Collection-specific fields live in `data`.

```ts
COLLECTIONS: Record<CmsCollection, CollectionDefinition>
type CollectionData<K extends CmsCollection>          // typed published data, e.g. CollectionData<"services">
// aliases: SiteSettingsData, HomepageData, NavigationData, AboutData, ServiceData, IndustryData, DestinationData,
// CaseStudyData, TestimonialData, FaqData, NewsData, BlogPostData, EventData, GalleryAlbumData, VideoData,
// PageData, TeamMemberData, ClientLogoData
getCollection(key): CollectionDefinition
describeCollection(key): CollectionDescriptor          // plain JSON for the generic editor (pass to client components)
describeAllCollections(): CollectionDescriptor[]       // singletons last
validateCollectionData(key, data, "draft" | "publish"): { ok: true; data } | { ok: false; fieldErrors }   // keys "data.<path>"
collectionDataSchema(key, mode, { omitInternal? }): ZodType
publicPathFor(key, slug): string | null                // "/services/<slug>", "/legal/privacy-policy", "/grievance"…
fixedSlugFor(key): string | null; isCmsCollection(value)
ICON_NAMES, HOMEPAGE_SECTION_OPTIONS, NEWS_CATEGORY_OPTIONS, EVENT_TYPE_OPTIONS, EVENT_FORMAT_OPTIONS,
TESTIMONIAL_TYPE_OPTIONS, FAQ_AUDIENCE_OPTIONS, PAGE_TYPE_OPTIONS, TEAM_GROUP_OPTIONS, SOCIAL_PLATFORM_OPTIONS, LEGAL_PAGE_PATHS
```

### Building the ONE generic editor

`describeCollection(key).fields` is an ordered array of `SerializedField`:
`{ name, type, label, help?, required, internal?, placeholder?, … }` with type-specific props:

| type | value stored | props |
|---|---|---|
| `text` / `textarea` | string | `maxLength`, `pattern`, `rows` |
| `richtext` | sanitised HTML (render with `<SafeHtml>`) | `maxLength` — use the Tiptap editor |
| `number` | number | `min`, `max`, `integer` |
| `boolean` | boolean | `defaultValue` |
| `date` / `datetime` | `"YYYY-MM-DD"` / ISO 8601 with offset | — |
| `select` / `multiselect` | option value / values | `options: {value,label}[]`, `maxItems` |
| `asset` / `assets` | media_assets id / ids | `kinds` (image, video, document, embed), `maxItems` — media picker |
| `url` | string | `urlKind`: `link` (http(s); site paths when `allowRelative`), `video` (YouTube/Vimeo → normalised player URL), `map` (Google Maps / OpenStreetMap embed) |
| `email` / `phone` | string (phone kept as typed, validated) | — |
| `textlist` | string[] | `maxItems`, `maxLength` |
| `list` | object[] | `fields` (nested), `itemLabel`, `titleField`, `minItems`, `maxItems` — repeatable rows, reorderable |
| `group` | object | `fields` (nested) — fieldset |
| `reference` | entry id(s) or taxonomy id(s) / language codes | `target: {kind:"collection", collection}` → `listReferenceOptions()`; `{kind:"taxonomy", taxonomy}` → taxonomy module options; `multiple`, `maxItems` |
| `country` | ISO alpha-2 (or array) | `multiple` → `countryOptions()` |

`required` means **required to publish**: drafts can be saved incomplete; publishing validates fully and the
error keys (`data.faqs.0.answer`) map to inputs. `internal` fields are editor-only notes (evidence, legal review)
and never reach the public site. Post the whole data object as JSON (`data:json`), SEO as `seo:json`, tags as `tags[]`.
Every save **replaces** all versioned fields (title, slug, summary, data, SEO, tags, hero image) — always send the
complete editor state; an omitted slug keeps the current one (singletons always keep their fixed slug).

Collection notes: `destinations.guidance` must have `reviewedAt` (not in the future), `reviewedBy`, ≥ 1 source and
a disclaimer to publish; `events` check end > start, venue for in-person, a joining/registration link for online;
`news` placement announcements need the internal `evidenceNote`; homepage sections must be unique; `services` with
`isActive: false` are hidden from listings; `videos` accept YouTube/Vimeo only.

## 2. Public site API (`queries.ts`, server-only)

All public reads return **published** content only (status published, not deleted, consent still valid for
testimonials / case studies / team members, client logos only with an approved, unexpired permission covering
the location) with internal fields stripped, plus the public media and referenced published entries they use.

```ts
getSingleton(key: CmsSingletonCollection, opts?: PublicReadOptions): Promise<PublishedEntryDetail<K> | null>
getSingletonData(key, opts?): Promise<CollectionData<K> | null>            // just the typed data
getPublishedEntries(collection, opts?: PublishedListOptions): Promise<PublishedEntryPage<K>>
  // opts: locale ("en"), category (collection's category field: news category, event type, testimonial type,
  //       FAQ audience, destination region, page type…), featured, tag, page, pageSize|limit (12, max 100),
  //       upcoming (events: true = not ended, false = past), logoLocation (REQUIRED for client_logos), excludeIds, now
getPublishedEntryBySlug(collection, slug, opts?: PublicReadOptions): Promise<PublishedEntryDetail<K> | null>
getPublishedEntriesByIds(ids, { now? }?): Promise<PublishedEntry[]>        // featured items, in the given order
getPublishedSlugs(collection, { locale?, now? }?): Promise<{ slug, path, contentUpdatedAt }[]>   // sitemap.ts
searchContent(q, { limit?, locale?, collections?, now? }?): Promise<ContentSearchResult[]>       // 2–100 chars; rate-limit the route
resolvePreviewTarget(token): Promise<{ collection, slug, path } | null>  // for a generic /preview?token= redirect
resolvePublicAssets(ids): Promise<AssetMap>
getActiveAnnouncements({ audience, placement, limit?, now? }): Promise<ActiveAnnouncement[]>
toBannerAnnouncement(a): Announcement props for <PublicHeader announcement>
getPublicMetrics({ now? }?): Promise<PublicMetric[]>     // [{ key, label, value, definition, asOf, mode }] — hide the section when []

type PublicReadOptions = { locale?: string; preview?: string | null; now?: Date }
type PublishedEntryDetail<K> = { entry: PublishedEntry<K>; assets: AssetMap; references: ReferenceMap; preview: boolean }
type PublishedEntryPage<K> = Paginated<PublishedEntry<K>> & { assets; references }
type PublishedEntry<K> = { id, collection, slug, locale, title, summary, data: CollectionData<K>, seo, tags, isFeatured,
  sortOrder, heroAssetId, publishedAt, contentUpdatedAt, path, logo: { organizationName, relationship } | null }
type PublicMediaAsset = { id, kind, title, alt, caption, credit, url, thumbnailUrl, variants: {thumb?,md?,lg?}, width,
  height, mimeType, embedProvider, embedUrl }
```

Typical page:

```tsx
const { preview } = await searchParams;                               // ?preview=<token>
const detail = await getPublishedEntryBySlug("services", slug, { preview });
if (!detail) notFound();
const hero = detail.entry.heroAssetId ? detail.assets[detail.entry.heroAssetId] : null;   // missing = not public
// detail.preview → show a "Preview" ribbon and noindex (seo.noindex is already true for previews)
```

Singletons fall back to English; when a singleton is missing or unpublished, render built-in defaults
(`PUBLIC_NAV`, `BRAND`). Legal pages: `/grievance` and `/legal/data-rights` should show the configured timelines
(`privacy.grievance_ack_hours`, `privacy.grievance_resolution_days`, `privacy.data_request_sla_days`) and the
grievance officer from `site_settings` next to the CMS text — the text never hard-codes them.

## 3. Command Centre API

All functions take the acting `StaffContext` (from `requireStaff`) and re-check permissions; writes are
transactional, row-locked and audited (`content.*`, `media.*`, `announcement.*`, `metrics.*`, `logo_permission.*`).

### Entries (`service.ts`)

| Function | Permission | Notes |
|---|---|---|
| `createEntry(ctx, CreateEntryInput): { id, slug, version }` | content.edit | Draft v1. Slug from title when omitted (unique); singletons get their fixed slug once per language. A soft-deleted entry holding the slug is renamed `<slug>-deleted-<id8>`. |
| `updateEntry(ctx, UpdateEntryInput): { version, changed }` | content.edit | New version on every save (`changed: false` for identical content). Rich text sanitised; media / entry / taxonomy references validated; `expectedVersion` → conflict error if someone saved meanwhile. **Live entries keep serving the published version.** |
| `publishEntry(ctx, { id, version? }): PublishOutcome` | content.publish | Publishes the latest (or given) version: copies it onto the row. Refused unless publish-valid, consent valid, logo permission approved, all referenced media public. **Testimonials and case studies always go to the approval centre** (`submitted_for_approval`). |
| `requestPublication(ctx, { id, version?, publishAt?, note? })` | content.edit | For editors without content.publish → approval `content_publication` (testimonial / case_study types for those collections). |
| `scheduleEntry(ctx, { id, version?, publishAt?, unpublishAt? }): ScheduleResult` | content.publish | Pins a version for `publishAt` (draft → `scheduled`; live entries stay `published` with a scheduled update). `null` clears, `undefined` keeps. `unpublishAt` archives automatically. |
| `unpublishEntry(ctx, id, reason?)` | content.publish | Offline as draft (not for site settings / homepage / navigation). |
| `archiveEntry(ctx, id, reason?)` / `restoreEntry(ctx, id)` | publish / edit | Restore works from archive and from the bin (→ draft). |
| `softDeleteEntry(ctx, id, reason?)` | edit (never-published drafts) / publish | Singletons cannot be deleted. |
| `rollbackEntry(ctx, { id, version, publish })` | content.publish | Copies an old version into a **new** version; optionally publishes it. |
| `duplicateEntry(ctx, { id, title?, locale? })` | content.edit | New draft `<slug>-copy`; consent and logo permission are never copied. |
| `reorderEntries(ctx, { collection, ids })`, `setEntryFeatured(ctx, id, featured)` | content.publish | Immediate on the live site. |
| `updateEntryConsent(ctx, EntryConsentInput): { status, takenOffline }` | content.edit | `obtained` needs a date and evidence (file or note). Withdrawal / expiry takes a live entry offline in the same update. Evidence files (purpose `cms_media` or `other`) are made private. |
| `setEntryLogoPermission(ctx, { id, logoPermissionId })` | content.edit | client_logos only. |
| `createPreviewLink(ctx, { id, version?: number \| "latest", ttlMinutes? }): PreviewLink` | content.view | `{ token, url, expiresAt, version }`; url = public path + `?preview=`. Audited. |
| `signPreviewToken(...)`, `verifyPreviewToken(token, now?)` | — | HMAC-signed `v1.<entryId>.<version\|l>.<exp>.<sig>`, default 60 min, max 24 h, entry-scoped. |

`PublishOutcome = { outcome: "published", version } | { outcome: "scheduled", version, publishAt } | { outcome: "submitted_for_approval", approvalId, approvalCode }`.

### Entry reads (`queries.ts`)

```ts
listEntries(ctx, EntryListFilters, PageQuery): Paginated<AdminEntryListItem>   // filters: collection, status, locale, q, tag, featured, deleted (bin), sort manual|updated|title|published
getEntryDetail(ctx, id): AdminEntryDetail | null        // row, latest editable content, versions, approvals, logo permission, usage count, publicPath
getSingletonForEditing(ctx, collection, locale?): AdminEntryDetail | null
getEntryVersion(ctx, id, version), compareEntryVersions(ctx, id, from, to): EntryVersionDiff   // field-level changes with labels
listReferenceOptions(ctx, collection, { q?, locale?, limit?, ids? })      // reference pickers
listCollectionsOverview(ctx), listScheduledContent(ctx, { from?, to? }), listEntryTags(ctx, collection)
```

### Media library

| Function | Notes |
|---|---|
| `createMediaAsset(ctx, CreateMediaAssetInput): MediaWriteResult` | From an uploaded file (`<FileUpload purpose="cms_media">`). Kind from the MIME type. Items showing people start internal (`needsConsent`). |
| `createEmbedAsset(ctx, CreateEmbedAssetInput)` | YouTube / Vimeo link, normalised (youtube-nocookie). |
| `updateMediaAsset(ctx, UpdateMediaAssetInput)` | Alt text (`decorative` → empty alt), caption, credit, tags, folder, people assessment. A public item becomes internal if the assessment changes to "people shown". |
| `updateMediaConsent(ctx, MediaConsentInput)` | Consent evidence; withdrawal / pending / expired → internal + private file at once; returns `affectedUsages`. |
| `setMediaVisibility(ctx, id, "public" \| "internal")` | Public requires people assessment, alt text for images, consent when people are shown. **Items showing people go to approval (`media_asset`).** |
| `archiveMediaAsset`, `restoreMediaAsset`, `deleteMediaAsset` | Archive / delete refused while used (lists where). Delete soft-deletes the file. |
| `createMediaFolder`, `renameMediaFolder`, `moveMediaFolder` (cycle-safe), `deleteMediaFolder` (no sub-folders) | |
| `syncMediaUsages(entityType, entityId, refs, tx?)`, `clearMediaUsages(...)` | For other modules embedding media (e.g. `"course"`). |
| `mediaUrl(asset, variant?)` | File URL via `fileUrl()` or the embed player URL. |
| Reads: `listMediaAssets(ctx, filters, page)`, `getMediaAsset(ctx, id)`, `listMediaFolders(ctx)`, `listMediaTags(ctx)`, `listAssetUsages(id)`, `countMediaNeedingConsent(ctx)` | media.manage or content.edit (pickers). |

Write permission: media.manage. Upload consent releases with `<FileUpload purpose="cms_media" visibility="private">`.

### Announcements

Staff (announcements.manage): `saveAnnouncement(ctx, AnnouncementInput)` (create/update), `publishAnnouncement`
(→ `scheduled` when `startsAt` is future), `expireAnnouncement`, `archiveAnnouncement`, `restoreAnnouncement`,
`deleteAnnouncement` (never-published drafts only), `listAnnouncements(ctx, filters, page)`, `getAnnouncement(ctx, id)`.

Partner organisations (`OrgContext`; employer.company.manage / partner.profile.manage / institution.profile.manage;
organisation must be verified): `savePartnerAnnouncement(ctx, PartnerAnnouncementInput)` → approval
`partner_announcement` (audience public/talent, placements notification centre / ticker / portal banner, priority
low/normal); `withdrawPartnerAnnouncement(ctx, id)`; `listPartnerAnnouncements(ctx)`. Portal page paths:
`PARTNER_ANNOUNCEMENT_PATHS`.

Broadcasts are never fanned out per user: banners and notification centres call `getActiveAnnouncements()`.

### Public metrics (metrics.public_manage)

```ts
listMetricConfigs(ctx): AdminMetricItem[]             // live value (computed when stale), manual figure, approval state, publicValue
updatePublicMetric(ctx, UpdateMetricInput)            // label, definition, mode live|manual|hidden, visibility, threshold, order
setManualMetricValue(ctx, ManualMetricValueInput)     // value + as-of date (not future) + evidence; clears approval and hides when changed
approveManualMetricValue(ctx, key)                    // snapshot of the current value/date (evidence required)
createCustomMetric(ctx, { key: "custom_…", label, definition }), deleteCustomMetric(ctx, key)
refreshLiveMetrics(now?, { keys?, onlyStale? }), computeLiveMetric(key), LIVE_METRICS
```

Live counters (read-only queries on other modules' tables): registered candidates (active accounts), verified
candidates (verification level ≠ none), active employers (verified, a job published in the last 90 days), employer
/ recruitment / training partners (verified organisations), jobs facilitated (ever published, not deleted),
successful placements (joined / completed), active countries (published jobs ∪ joined placements), training
programmes (published courses), internship opportunities (published internship jobs). The DB CHECK
`public_metrics_display_chk` and `metric-rules.ts` both guarantee that nothing else is ever shown.

### Logo permissions

`saveLogoPermission(ctx, LogoPermissionInput)` (content.edit; approved ones need content.publish),
`approveLogoPermission(ctx, id)` and `revokeLogoPermission(ctx, { id, reason })` (content.publish; revocation takes
linked logos offline), reads `listLogoPermissions(ctx, filters, page)`, `getLogoPermission(ctx, id)`,
`listUsableLogoPermissions(ctx)`.

## 4. Server Actions (`actions.ts`)

Entries: `createEntryAction`, `updateEntryAction` (forms), `publishEntryAction`, `requestPublicationAction`,
`scheduleEntryAction`, `unpublishEntryAction`, `archiveEntryAction`, `restoreEntryAction`, `deleteEntryAction`,
`rollbackEntryAction`, `duplicateEntryAction`, `reorderEntriesAction`, `setEntryFeaturedAction`,
`updateEntryConsentAction` (form), `setEntryLogoPermissionAction`, `createPreviewLinkAction`.
Media: `createMediaAssetAction`, `createEmbedAssetAction`, `updateMediaAssetAction`, `updateMediaConsentAction`
(forms), `setMediaVisibilityAction`, `archiveMediaAssetAction`, `restoreMediaAssetAction`, `deleteMediaAssetAction`,
`createMediaFolderAction`, `renameMediaFolderAction` (forms), `moveMediaFolderAction`, `deleteMediaFolderAction`.
Announcements: `saveAnnouncementAction` (form), `publishAnnouncementAction`, `expireAnnouncementAction`,
`archiveAnnouncementAction`, `restoreAnnouncementAction`, `deleteAnnouncementAction`,
`savePartnerAnnouncementAction` (form + hidden `orgType`), `withdrawPartnerAnnouncementAction`.
Metrics: `updatePublicMetricAction`, `setManualMetricValueAction`, `createCustomMetricAction` (forms),
`approveManualMetricValueAction`, `deleteCustomMetricAction`, `refreshLiveMetricsAction`.
Logo permissions: `saveLogoPermissionAction`, `revokeLogoPermissionAction` (forms), `approveLogoPermissionAction`.

All return `ActionResult` (`ok(data, message)`); date-times are ISO 8601 with offset (convert `datetime-local`
in the browser).

## 5. Approvals (`approval-handlers.ts`)

| Type | Submitted by | Approved → | Rejected / changes |
|---|---|---|---|
| `testimonial`, `case_study` | every publish / schedule / rollback-and-publish of those collections (consent evidence must already be recorded) | publishes the pinned version (or schedules it when the request has a future `publishAt`), re-checking all rules | entry unchanged |
| `content_publication` | `requestPublication` (editors) | same as above | entry unchanged |
| `media_asset` | public use of media showing people | asset public (consent re-checked), file public | stays internal |
| `partner_announcement` | partner organisations | published (or scheduled) | rejected → archived; changes → draft for the partner |

Decision: consent-sensitive content **always** goes through approval (a second person checks the evidence),
and submission is refused until consent is recorded — the approver cannot fix missing evidence.

## 6. Background tasks

`content.publish_scheduled` (every 5 minutes, already in `RECURRING_TASKS`): publishes pinned versions at
`publishAt` (a version that no longer validates clears the schedule and alerts publishers), archives at
`unpublishAt`, archives testimonials / case studies / team members whose consent expired, starts / expires
announcements, withdraws public use of media whose consent expired, expires logo permissions (taking linked logos
offline), refreshes stale live metric values. Idempotent, `for update skip locked`, one failing step does not
block the others. `content.refresh_public_metrics` (on demand) recomputes every live metric. Staff alerts use the
existing `work.reminder` event (to content.publish / media.manage holders) — no new event keys.

## 7. Seed (`seed.ts`)

Insert-only by (collection, slug, language), including entries in the bin — never overwrites admin edits.
Published: site settings (legal entity + headquarters only), homepage (spec hero copy and CTAs), navigation
(PUBLIC_NAV + footer columns), About (facts; mission / vision / values as an unpublished version 2), 11 services
(existing activities / launch features), 7 legal pages (version 2026-11-01, internal note: legal review required).
Drafts: 7 services, 20 industries, 6 GCC destinations (empty, unreviewed guidance), 10 FAQs. Public metric
definitions for all 11 standard counters, hidden. No testimonials, case studies, news, team members or logos.

## 8. Tests

```powershell
npx vitest run src/modules/content                         # pure: collections, fields, versioning/diff, metric rules, embeds, preview tokens, seed data
node scripts/test-db.mjs vsg_test_content
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_content'; npx vitest run src/modules/content
```

`content.integration.test.ts`: seed idempotency, live page unchanged until republish, rollback, slug changes,
bin + slug reuse, permissions, testimonial consent + approval, DB-level consent guarantee, scheduled publication /
scheduled update / failed schedule / unpublish / consent expiry, public metrics never leaking unapproved figures
(service and DB CHECK), preview tokens, media usage + consent + approval + withdrawal, announcements by schedule /
audience / placement, partner announcements, client logos by permission location, search, the scheduled task.
