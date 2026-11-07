# Analytics module (`src/modules/analytics`)

First-party, consent-gated website analytics (spec 13): cookie consent, the browser tracker, the
collector, server-side conversions, admin dashboards, funnels, heatmaps, daily roll-ups and retention.
AI features are out of scope. Schema: `src/db/schema/analytics.ts` (see `docs/SCHEMA_NOTES.md` §4.12).

**Privacy by design.** Nothing is recorded without analytics consent (checked in the browser *and* by the
collector). Ids are random tokens; no IP address (rate limiting uses a salted hash that is never stored), no
user-agent string (device / browser / OS family only), country from the edge geo header only. Paths are
stored without query strings and with identifiers replaced (`/invite/[token]`, `/talent/applications/[id]`).
Only whitelisted query parameters (`page, type, category, country, industry, overseas, mode, experience,
sort, tab, view, intent, lang, status`) and `utm_*` are kept. No form values, keystrokes, clipboard or
element text; nothing inside `[data-analytics-ignore]`. Global Privacy Control turns analytics and session
insights off by default. **Staff (internal traffic) and minors (DPDP Rules 2025) are never tracked.**
`/admin`, `/dev` and `/api` are never tracked.

## Files

| File | Kind | What it holds |
|---|---|---|
| `events.ts` | client-safe | `ANALYTICS_EVENTS`, `CONVERSION_EVENTS`, `ANALYTICS_EVENT_LABELS`, `isAnalyticsEvent()` |
| `client.ts` | client | `track(name, props?)` |
| `consent.ts` | client-safe, pure | consent cookie model, GPC rule, version, mappings |
| `privacy-rules.ts` | client-safe, pure | path normalisation, query whitelist, selector / prop sanitisation |
| `schemas.ts` | client-safe | zod: collector payload, consent receipt, admin forms, filters |
| `range.ts` | client-safe, pure | reporting date ranges with previous period |
| `types.ts` | client-safe | result types of every query |
| `default-funnels.ts`, `funnel-rules.ts`, `rollup.ts` | pure | default funnels, funnel validation + reference evaluation, roll-up rows |
| `config.ts` | server | consent version, tracker config, `isExcludedFromTracking()` |
| `collect.ts`, `http.ts` | server | collector ingestion and request helpers |
| `consent-service.ts` | server | consent receipts (+ consent ledger for signed-in users) |
| `server.ts` | server | `trackServer()` |
| `queries.ts` | server | traffic dashboards |
| `behaviour.ts` | server | events, forms, search, heatmaps, CTAs |
| `funnels.ts` | server | funnel definitions and computation |
| `sessions.ts` | server | session diagnostics (restricted, logged) |
| `service.ts`, `actions.ts` | server | campaigns, funnels, CSV export; Server Actions |
| `dsar.ts` | server | data-subject request support (summary, erasure) |
| `limits.ts` | client-safe | collector batch limits |
| `aggregate.ts`, `retention.ts`, `tasks.ts`, `seed.ts` | server | background tasks and seed |

## Tracking from other modules

### Client: `track()` — `@/modules/analytics/client`

```ts
track(name: AnalyticsEvent, props?: AnalyticsProps): void
track("job_saved", { jobId: job.id });
```

Events are queued on `window.__vsgAnalyticsQueue` and only sent once the visitor has analytics consent
(queued events are discarded otherwise). Props must be non-personal (public ids, categories, counts, filter
names); the collector drops keys such as `email`, `name`, `phone`, `q`, `query`, `message`, values containing
`@` or phone numbers, and anything over 200 characters.

### HTML attributes understood by the tracker (no code needed)

| Attribute | Effect |
|---|---|
| `data-analytics-cta="hire_through_venkat_sai"` (+ optional `data-analytics-location="hero"`) | `cta_click { cta, location }` on click → CTA performance |
| `data-analytics-form="employer_enquiry"` on a `<form>` | `form_started` on first field focus, `form_submitted` on submit (`{ formId }`) → form abandonment. Field values are never read. |
| `data-analytics-id="apply_button"` | readable anchor in heatmap selectors |
| `data-analytics-ignore` | no clicks, heatmap points or form events inside; masked in Clarity |

Automatic: `page_view` on every route change, `outbound_click { domain }`, `file_download { extension }`,
heatmap clicks with rage / dead click detection (flag `analytics.heatmaps`), scroll-depth milestones
(25/50/75/90/100 %).

### Server: `trackServer()` — `@/modules/analytics/server`

```ts
trackServer(event: AnalyticsEvent, props?: AnalyticsProps, opts?: { path?: string }): Promise<void>
await trackServer("application_submitted", { jobId: job.id });   // after the transaction commits
```

For conversions recorded on the server (Server Actions / Route Handlers). Attributes the event to the
visitor's analytics session (cookie `vsg_sid`); no-op without analytics consent, without that cookie, when
analytics is off, or for staff / minors. Never throws. Record each conversion once (client **or** server).

### Events other modules should emit (used by the default funnels and conversion reports)

| Event | Props | Owner |
|---|---|---|
| `registration_completed` | `{ intent: "candidate" \| "employer" \| "partner" \| "institution" }` | identity (sign-up verified) |
| `organization_verification_submitted` | `{ orgType }` | organizations |
| `requirement_submitted` | `{ kind }` | operations |
| `application_started` / `application_submitted` | `{ jobId }` | recruitment / People Portal |
| `employer_enquiry_submitted`, `contact_form_submitted` | `{ formId }` | operations / public site |
| `course_enrolment_completed` | `{ courseId }` | training |
| `job_search` / `filter_applied` | `{ category?, filters?: "type,country", filter? }` (never keywords) | jobs |

`CONVERSION_EVENTS` (events.ts) lists the key events counted as conversions.

## Consent — components in `@/components/privacy`

| Export | Where |
|---|---|
| `ConsentBanner` (server) | root layout (already mounted). Bottom banner on first visit and after a consent-version change: Accept all / Reject non-essential / Customise (dialog). With GPC and no choice, records the signal (method `browser_signal`) and shows a short notice. |
| `ConsentPreferences` (server) | `<ConsentPreferences />` on `/cookie-preferences`, `<ConsentPreferences source="account_privacy" />` on `/account/privacy` |
| `ConsentPreferencesForm` (client) | props `{ version?, services?, locale?, source?, onSaved?, className? }` — use inside client UI |
| `useConsent(version?)` (client hook) | `{ ready, version, stored, categories, needsPrompt, gpc, save, acceptAll, rejectAll, openPreferences }` |
| `openCookiePreferences()` (`consent-store.ts`) | open the banner's preferences dialog, e.g. from a footer "Cookie settings" button |

Categories: essential (always on), `functional`, `analytics`, `session_insights`. Cookie `vsg_consent`
(URL-encoded JSON `{ version, categories, anonymousId, timestamp, gpc? }`, 12 months, SameSite=Lax, not
httpOnly). Version = `<CONSENT_REVISION>.<setting privacy.policy_version>` — bump `CONSENT_REVISION` in
`consent.ts` when categories change, or the privacy notice version in settings to re-prompt everyone.
Every choice is receipted by `POST /api/v1/consent` into `analytics_consent_logs` and, for signed-in users,
into `consent_records` (`analytics_cookies`, `session_insights`, `functional_cookies`; changed purposes only).

Pure helpers (`consent.ts`): `parseConsentCookie(raw)`, `serializeConsentCookie(c)`,
`consentNeedsPrompt(stored, version)`, `effectiveConsent(stored, version, gpc)`, `consentLevelFor(categories)`,
`toLedgerChoices(categories)`, `buildConsentVersion(policyVersion)`, `CONSENT_COOKIE`, `ANALYTICS_SESSION_COOKIE`.
Server: `getConsentVersion(): Promise<string>`, `getConsentServices(): Promise<{ ga4, clarity }>`,
`recordConsentReceipt(input, { userId }): Promise<{ receiptId, ledgerPurposes }>`.

## Browser tracker — `@/components/analytics`

`AnalyticsTracker` (server, mounted in the root layout) reads `getAnalyticsClientConfig()` (flags
`analytics.first_party`, `analytics.heatmaps`, `analytics.clarity`, `analytics.ga4`; settings
`analytics.clarity_project_id`, `analytics.ga4_measurement_id`; CSP nonce from `x-nonce`; staff / minor
exclusion) and renders `AnalyticsTrackerClient`. Session id in `sessionStorage` (rotated after 30 idle
minutes, mirrored in cookie `vsg_sid` for server attribution), visitor id in `localStorage`; batches go to
`/api/v1/collect` via `navigator.sendBeacon` (fetch keepalive fallback). GA4 loads only with analytics
consent (Consent Mode v2, everything denied by default, ads signals off, manual page views with normalised
paths and no page titles); Clarity only with session-insights consent, starts on public pages, and masks
whole pages in signed-in areas. **Set Clarity's masking mode to "Strict" in the Clarity dashboard.**
Withdrawing consent clears the ids and cookies (and reloads the page if Clarity was running).

## Route handlers

| Route | Contract |
|---|---|
| `POST /api/v1/collect` | Body `collectPayloadSchema` (≤ 64 KB; ≤ 50 events, ≤ 50 heatmap points, ≤ 20 scroll records). Same-origin (or `Sec-Fetch-Site: same-origin` when a beacon omits Origin), rate limit 120/min per IP hash, bots dropped, consent cookie + `Sec-GPC` checked server-side. `204` stored or silently dropped · `400` · `403` · `413` · `429`. |
| `POST /api/v1/consent` | Body `consentReceiptSchema`. Same-origin, rate limit 30 / 10 min per IP hash. `204` · `400` · `403` · `429`. |

## Admin read API (Command Centre `/admin/analytics`)

Every function takes a `StaffContext` (`requireStaff("analytics.view")`) and throws
`ActionError(code: "forbidden")` without the permission. Ranges: `getAnalyticsRange(searchParams)` (server,
reporting timezone = env `DEFAULT_TIMEZONE`) → `AnalyticsRange` (`?range=today|yesterday|7d|30d|90d|12m|custom&from=&to=`,
max 400 days, previous period included). Invalid hand-built ranges throw `code: "invalid_range"`.

```ts
// queries.ts — traffic
getAnalyticsOverview(staff, range): Promise<AnalyticsOverview>        // KPIs + previous period + change
getAnalyticsTimeSeries(staff, range): Promise<TimeSeriesPoint[]>      // one point per day
getTopPages(staff, range, { limit? }): Promise<PageRow[]>             // + avg scroll depth
getLandingPages(staff, range, { limit? }): Promise<LandingPageRow[]>
getExitPages(staff, range, { limit? }): Promise<ExitPageRow[]>
getTrafficSources(staff, range, { limit? }): Promise<SourceRow[]>     // utm_source → referrer → (direct)
getReferrers(staff, range, { limit? }): Promise<ReferrerRow[]>
getCampaignPerformance(staff, range): Promise<CampaignRow[]>          // + cost per acquisition (lifetime)
getTechBreakdown(staff, range): Promise<TechBreakdown>                // devices, browsers, OS
getCountryBreakdown(staff, range, { limit? }): Promise<CountryRow[]>
getActiveVisitors(staff): Promise<ActiveVisitors>                     // last 5 minutes
getDailyMetricSeries(staff, { metric, dimension?, dimensionValue?, from, to }): Promise<DailyMetricPoint[]>  // roll-ups, beyond raw retention
listCampaigns(staff): Promise<CampaignDefinition[]>, getCampaign(staff, id): Promise<CampaignDefinition | null>

// behaviour.ts
listEvents(staff, range, { name?, path? ("/jobs*" = prefix), source? }, page: PageQuery): Promise<Paginated<EventRow>>  // sessionId only with analytics.sessions
getEventCounts(staff, range): Promise<EventCountRow[]>
getFormAnalytics(staff, range): Promise<FormAnalyticsRow[]>           // started vs submitted per formId
getSearchAnalytics(staff, range): Promise<SearchAnalytics>            // categories + filter keys (no free text)
getHeatmap(staff, range, { path, viewport: "mobile"|"tablet"|"desktop", kind? }): Promise<HeatmapResult>  // 10‰ × 25 px cells, top selectors, scroll reach
listHeatmapPages(staff, range, { viewport?, limit? }): Promise<HeatmapPageRow[]>
getCtaPerformance(staff, range): Promise<CtaRow[]>                    // clicks, sessions, converted sessions

// funnels.ts
listFunnels(staff, { activeOnly? }): Promise<FunnelDefinition[]>, getFunnel(staff, id)
computeFunnel(staff, funnelId, range, { groupBy?: "visitor" | "session" }): Promise<FunnelResult>
previewFunnel(staff, { steps, windowDays }, range, { groupBy? }): Promise<FunnelResult>

// sessions.ts — permission analytics.sessions
listSessions(staff, range, { landingPath?, deviceType?, signedInOnly?, minPageViews? }, page): Promise<Paginated<SessionListRow>>
getSessionTimeline(sessionId, staff, { reason? }): Promise<SessionTimeline>  // audited + data_access_logs; includes userId — show only as a link to the user record
```

Funnels: steps `{ label, match: { event?, path? ("/jobs" exact, "/jobs/*" prefix), props? (all equal) } }`.
Per visitor (or session): step 1 is the first match inside the range; each later step is the first match at
or after the previous step and within `windowDays` of step 1. Results give count, conversion from start and
from the previous step, drop-off and drop-off rate per step.

## Admin write API (`analytics.configure` / `analytics.export`, all audited)

```ts
// service.ts
saveCampaign(staff, input: CampaignFormInput): Promise<{ id, created }>   // cost typed in major units of `currency` → minor units
deleteCampaign(staff, id): Promise<void>
saveFunnel(staff, input: FunnelFormInput): Promise<{ id, created }>
setFunnelActive(staff, id, isActive): Promise<void>
deleteFunnel(staff, id): Promise<void>                                     // seeded funnels (key) can only be deactivated
exportAnalyticsCsv(staff, "events" | "sessions" | "daily_metrics", range): Promise<{ filename, csv, rows, truncated }>  // ≤ 50,000 rows, no visitor/user ids

// actions.ts ("use server", revalidate /admin/analytics)
saveCampaignAction (form, campaignFormSchema), deleteCampaignAction({ id }),
saveFunnelAction (form, funnelFormSchema; steps posted as "steps:json"),
setFunnelActiveAction({ id, isActive }), deleteFunnelAction({ id })
```

### Data-subject requests (`dsar.ts`, for the privacy module)

```ts
type DsarActor = { kind: "staff"; staff: StaffContext /* needs privacy.requests */ } | { kind: "system"; reason: string };
summarizeAnalyticsForUser(actor, userId): Promise<AnalyticsSubjectSummary>   // sessions, events, first/last seen, countries, devices
eraseAnalyticsForUser(actor, userId): Promise<{ sessions: number; events: number }>
```

A user is linked through `analytics_sessions.userId`; their visitor ids also reach their signed-out sessions on
the same browsers, which are included. Roll-ups, heatmap points and consent receipts are not personal and stay.

Audit actions: `analytics.campaign_created|updated|deleted`, `analytics.funnel_created|updated|activated|deactivated|deleted`,
`analytics.exported`, `analytics.session_viewed`, `analytics.subject_data_summarized`, `analytics.subject_data_erased`.

## Background tasks (`tasks.ts`, scheduled in `src/server/tasks/schedule.ts`)

| Task | Schedule | Work |
|---|---|---|
| `analytics.aggregate` | hourly | Recompute today + yesterday (reporting timezone) into `analytics_daily_metrics`: sessions, visitors, new_visitors, page_views, bounces, bounce_rate, total_duration, avg_duration, `conversions:<event>` for dimensions all / source / medium / referrer / campaign / device / browser / os / country / locale; page_views / sessions / visitors per path. Payload `{ dates: ["YYYY-MM-DD", …] }` backfills (≤ 62 days). Idempotent. |
| `analytics.retention` | daily | Delete events and scroll depth older than `analytics.retention_days_events`, heatmap points older than `analytics.retention_days_heatmaps`, sessions older than `analytics.retention_days_sessions` (minimum 1 day). Roll-ups and consent receipts are kept. |

## Seed

`seed()` inserts the default funnels (`employer_journey`, `candidate_journey`, spec 13.2) when missing;
never overwrites edited funnels.

## Tests

`privacy-rules.test.ts`, `consent.test.ts`, `schemas.test.ts` (payload validation, ranges), `rollup.test.ts`
(roll-up rows, funnel rules) and `analytics.integration.test.ts` (collector route, consent route + ledger,
server conversions, funnel computation vs. the reference implementation, every dashboard query, roll-ups,
session diagnostics logging, exports, funnel admin, retention):

```powershell
node scripts/test-db.mjs vsg_test_analytics
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_analytics'; npx vitest run src/modules/analytics
```
