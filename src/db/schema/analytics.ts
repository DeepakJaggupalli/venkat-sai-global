/**
 * First-party, consent-gated website analytics (spec 13): pseudonymous sessions and events, click and scroll
 * heatmaps, manual campaign cost entry, funnel definitions, daily roll-ups and cookie-consent receipts.
 * Layer 16 — may import from every earlier layer; this file only needs taxonomy and core.
 *
 * Privacy by design (docs/CONVENTIONS.md → Privacy checklist). These tables hold NO direct personal data:
 *  - identifiers are random tokens generated in the browser (CHECK: [A-Za-z0-9_-]{16,64}, so an email address
 *    or phone number can never be stored as an id); no IP addresses (not even hashed); no user-agent strings
 *    (coarse browser / OS family only); geography is country + first-level region at most;
 *  - paths are stored without query string or fragment (CHECK), and the collector replaces secrets and personal
 *    identifiers in dynamic segments with their route pattern (e.g. /invite/[token]);
 *  - no form contents, keystrokes or element text: heatmaps keep a sanitised selector whose CHECK rejects
 *    attribute values, and UTM values containing "@" are rejected;
 *  - a session recorded without analytics consent (consentLevel `essential`) carries no visitor or user id (CHECK);
 *  - raw rows are deleted by the analytics.retention task (settings analytics.retention_days_*); long-term
 *    reporting reads analytics_daily_metrics.
 * The only link to a person is analytics_sessions.userId (signed-in sessions with analytics consent); reading it
 * requires the analytics.sessions permission and is logged in data_access_logs.
 *
 * CHECK expressions are written NULL-safe on purpose (a CHECK that evaluates to NULL accepts the row).
 */
import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { countryCode, createdAtOnly, currencyCode, emptyJsonObject, moneyMinor, pk, timestamps, tstz } from "./_shared";
import { users } from "./core";
import { currencies } from "./taxonomy";

/** Random client-generated token: never derived from personal data and unable to hold an email or phone number. */
const randomIdSql = (column: SQLWrapper): SQL => sql`${column} ~ '^[A-Za-z0-9_-]{16,64}$'`;

/** URL path only: starts with "/", no query string, fragment or whitespace, bounded length. */
const pathSql = (column: SQLWrapper): SQL => sql`(${column} ~ '^/[^?#[:space:]]*$' and char_length(${column}) <= 1024)`;

/** Optional short label taken from a URL parameter (utm_*): bounded, and never an email address. */
const shortLabelSql = (column: SQLWrapper): SQL =>
  sql`(${column} is null or (char_length(${column}) <= 200 and position('@' in ${column}) = 0))`;

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Consent level of a session: essential = recorded without analytics consent, so it may carry no visitor or user
 * id (CHECK) — whether such sessions are recorded at all is the analytics module's policy (the browser tracker
 * sends nothing without consent); analytics = first-party analytics consent; session_insights = additionally
 * consented to session insights (e.g. Microsoft Clarity, which keeps its own data).
 */
export const ANALYTICS_CONSENT_LEVELS = ["essential", "analytics", "session_insights"] as const;
export type AnalyticsConsentLevel = (typeof ANALYTICS_CONSENT_LEVELS)[number];

export const ANALYTICS_DEVICE_TYPES = ["mobile", "tablet", "desktop", "other"] as const;
export type AnalyticsDeviceType = (typeof ANALYTICS_DEVICE_TYPES)[number];

export const ANALYTICS_VIEWPORT_BUCKETS = ["mobile", "tablet", "desktop"] as const;
export type AnalyticsViewportBucket = (typeof ANALYTICS_VIEWPORT_BUCKETS)[number];

export const ANALYTICS_HEATMAP_KINDS = ["click", "dead_click", "rage_click"] as const;
export type AnalyticsHeatmapKind = (typeof ANALYTICS_HEATMAP_KINDS)[number];

/** client = sent by the browser tracker; server = conversion recorded by server code (trackServer). */
export const ANALYTICS_EVENT_SOURCES = ["client", "server"] as const;
export type AnalyticsEventSource = (typeof ANALYTICS_EVENT_SOURCES)[number];

export const ANALYTICS_CAMPAIGN_CHANNELS = [
  "paid_search",
  "paid_social",
  "organic_social",
  "email",
  "sms",
  "whatsapp",
  "display",
  "referral",
  "partner",
  "offline",
  "other",
] as const;
export type AnalyticsCampaignChannel = (typeof ANALYTICS_CAMPAIGN_CHANNELS)[number];

/**
 * Roll-up metrics. Additive metrics (sessions, page_views, bounces, total_duration, conversions:<event>) can be
 * summed across days; rates and averages over a range must be recomputed from additive ones
 * (bounce_rate = bounces / sessions, avg_duration = total_duration / sessions), and visitors / new_visitors are
 * distinct counts per day (not additive). bounce_rate is a fraction 0–1; durations are seconds.
 */
export const ANALYTICS_DAILY_METRICS = [
  "sessions",
  "visitors",
  "new_visitors",
  "page_views",
  "bounces",
  "bounce_rate",
  "total_duration",
  "avg_duration",
] as const;
export type StandardAnalyticsDailyMetric = (typeof ANALYTICS_DAILY_METRICS)[number];
/** A standard metric or `conversions:<event name>`. */
export type AnalyticsDailyMetric = StandardAnalyticsDailyMetric | `conversions:${string}`;

/**
 * Breakdown dimensions of analytics_daily_metrics. source = utm_source, else referrer domain, else "(direct)".
 * dimensionValue is "" for `all`.
 */
export const ANALYTICS_DIMENSIONS = [
  "all",
  "path",
  "source",
  "medium",
  "referrer",
  "campaign",
  "device",
  "browser",
  "os",
  "country",
  "locale",
] as const;
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

/** How a cookie-consent choice was made (browser_signal = Global Privacy Control / Do Not Track honoured). */
export const ANALYTICS_CONSENT_METHODS = ["accept_all", "reject_all", "custom", "withdrawn", "browser_signal"] as const;
export type AnalyticsConsentMethod = (typeof ANALYTICS_CONSENT_METHODS)[number];

/** Non-personal event properties: a flat object of public ids, categories, counts and filter names. */
export type AnalyticsEventProps = Record<string, string | number | boolean | null>;

/**
 * A funnel step matches an event name and/or a path (exact path, or a prefix ending in "*"), optionally
 * narrowed by event properties (all must be equal, e.g. { intent: "employer" }).
 */
export type AnalyticsFunnelStep = {
  label: string;
  match: { event?: string; path?: string; props?: Record<string, string | number | boolean> };
};

/**
 * Cookie-banner choice per category, e.g.
 * { essential: true, analytics_cookies: false, session_insights: false, functional_cookies: true }.
 */
export type AnalyticsConsentCategories = Record<string, boolean>;

// ---------------------------------------------------------------------------
// Raw collection (written by /api/v1/collect, deleted by analytics.retention)
// ---------------------------------------------------------------------------

/**
 * One visit. `id` is generated in the browser per visit; visitorId is a random first-party id kept only with
 * analytics consent. Counters are maintained by the collector. UTM values are lower-cased by the collector so
 * they match analytics_campaigns.utmCampaign. DSAR deletion: delete by userId or visitorId (cascades to events
 * and scroll depth).
 */
export const analyticsSessions = pgTable(
  "analytics_sessions",
  {
    id: text().primaryKey(),
    visitorId: text(),
    consentLevel: text({ enum: ANALYTICS_CONSENT_LEVELS }).notNull(),
    /** Signed-in user, only with analytics consent. Restricted: analytics.sessions permission, access logged. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    startedAt: tstz().notNull().defaultNow(),
    lastSeenAt: tstz().notNull().defaultNow(),
    landingPath: text(),
    exitPath: text(),
    /** Referrer host only (e.g. "www.google.com"), never the full referring URL. */
    referrerDomain: text(),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    utmTerm: text(),
    utmContent: text(),
    deviceType: text({ enum: ANALYTICS_DEVICE_TYPES }),
    /** Browser / OS family names only ("Chrome", "Android") — no versions, no user-agent string. */
    browser: text(),
    os: text(),
    /** ISO-3166-1 alpha-2 from the edge geo header. Not a FK: geo providers emit codes outside the countries table. */
    countryCode: countryCode(),
    /** First-level subdivision at most (state / province); never city or postcode. */
    region: text(),
    /** Site UI language during the visit ("en", "hi", "te"). */
    locale: text(),
    isNewVisitor: boolean().notNull().default(false),
    pageViews: integer().notNull().default(0),
    events: integer().notNull().default(0),
    isBounce: boolean().notNull().default(true),
    durationSeconds: integer().notNull().default(0),
  },
  (t) => [
    index("analytics_sessions_started_idx").on(t.startedAt),
    index("analytics_sessions_last_seen_idx").on(t.lastSeenAt),
    index("analytics_sessions_visitor_idx").on(t.visitorId, t.startedAt).where(sql`${t.visitorId} is not null`),
    index("analytics_sessions_user_idx").on(t.userId).where(sql`${t.userId} is not null`),
    index("analytics_sessions_campaign_idx").on(t.utmCampaign, t.startedAt).where(sql`${t.utmCampaign} is not null`),
    check("analytics_sessions_id_chk", randomIdSql(t.id)),
    check("analytics_sessions_visitor_chk", sql`${t.visitorId} is null or ${randomIdSql(t.visitorId)}`),
    check("analytics_sessions_consent_chk", sql`${t.consentLevel} <> 'essential' or (${t.visitorId} is null and ${t.userId} is null)`),
    check(
      "analytics_sessions_paths_chk",
      sql`(${t.landingPath} is null or ${pathSql(t.landingPath)}) and (${t.exitPath} is null or ${pathSql(t.exitPath)})`,
    ),
    check("analytics_sessions_referrer_chk", sql`${t.referrerDomain} is null or ${t.referrerDomain} ~ '^[a-z0-9.-]{1,253}$'`),
    check(
      "analytics_sessions_utm_chk",
      sql`${shortLabelSql(t.utmSource)} and ${shortLabelSql(t.utmMedium)} and ${shortLabelSql(t.utmCampaign)} and ${shortLabelSql(t.utmTerm)} and ${shortLabelSql(t.utmContent)}`,
    ),
    check(
      "analytics_sessions_coarse_chk",
      sql`(${t.countryCode} is null or ${t.countryCode} ~ '^[A-Z]{2}$') and (${t.region} is null or char_length(${t.region}) <= 100) and (${t.browser} is null or char_length(${t.browser}) <= 50) and (${t.os} is null or char_length(${t.os}) <= 50) and (${t.locale} is null or char_length(${t.locale}) <= 35)`,
    ),
    check(
      "analytics_sessions_counters_chk",
      sql`${t.pageViews} >= 0 and ${t.events} >= 0 and ${t.durationSeconds} >= 0 and ${t.lastSeenAt} >= ${t.startedAt}`,
    ),
  ],
);

/**
 * Append-only event stream (page views, CTA clicks, conversions…); names come from ANALYTICS_EVENTS in
 * src/modules/analytics/events.ts. props holds non-personal context only (public object ids, categories,
 * counts, filter names) — never names, contact details or text typed by the visitor. Client events always
 * belong to a session; server-side conversions may have none.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sessionId: text().references(() => analyticsSessions.id, { onDelete: "cascade" }),
    /** Copied from the session so funnels can follow a visitor across sessions. */
    visitorId: text(),
    name: text().notNull(),
    source: text({ enum: ANALYTICS_EVENT_SOURCES }).notNull().default("client"),
    path: text(),
    props: jsonb().$type<AnalyticsEventProps>().notNull().default(emptyJsonObject),
    occurredAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("analytics_events_occurred_idx").on(t.occurredAt),
    index("analytics_events_name_occurred_idx").on(t.name, t.occurredAt),
    index("analytics_events_path_occurred_idx").on(t.path, t.occurredAt),
    index("analytics_events_session_idx").on(t.sessionId),
    index("analytics_events_visitor_idx").on(t.visitorId, t.occurredAt).where(sql`${t.visitorId} is not null`),
    check("analytics_events_name_chk", sql`${t.name} ~ '^[a-z][a-z0-9_]{1,63}$'`),
    check("analytics_events_visitor_chk", sql`${t.visitorId} is null or ${randomIdSql(t.visitorId)}`),
    check("analytics_events_path_chk", sql`${t.path} is null or ${pathSql(t.path)}`),
    check("analytics_events_source_chk", sql`${t.source} <> 'client' or ${t.sessionId} is not null`),
    check("analytics_events_props_chk", sql`jsonb_typeof(${t.props}) = 'object' and octet_length(${t.props}::text) <= 4096`),
  ],
);

/**
 * Click positions for page heatmaps. Deliberately not linked to a session or visitor (aggregate use only, so
 * the points are not personal data). xPct is per mille (0–1000) of the document width; yPx is the document y
 * coordinate in CSS pixels. selector is a sanitised element path built from tag names, ids, classes and
 * data-analytics attributes — never element text or attribute values (CHECK rejects quotes, "=" and "@").
 */
export const analyticsHeatmapPoints = pgTable(
  "analytics_heatmap_points",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    path: text().notNull(),
    viewportWidthBucket: text({ enum: ANALYTICS_VIEWPORT_BUCKETS }).notNull(),
    xPct: integer().notNull(),
    yPx: integer().notNull(),
    docHeight: integer().notNull(),
    selector: text(),
    kind: text({ enum: ANALYTICS_HEATMAP_KINDS }).notNull().default("click"),
    occurredAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("analytics_heatmap_points_page_idx").on(t.path, t.viewportWidthBucket, t.occurredAt),
    index("analytics_heatmap_points_occurred_idx").on(t.occurredAt),
    check("analytics_heatmap_points_path_chk", pathSql(t.path)),
    check("analytics_heatmap_points_coords_chk", sql`${t.xPct} between 0 and 1000 and ${t.yPx} >= 0 and ${t.docHeight} > 0`),
    check(
      "analytics_heatmap_points_selector_chk",
      sql`${t.selector} is null or (char_length(${t.selector}) <= 512 and ${t.selector} !~ '[''"=@]')`,
    ),
  ],
);

/**
 * Deepest scroll position reached per session and page (one row per pair, upserted with greatest()).
 * maxDepthPct is 0–100 of the document height.
 */
export const analyticsScrollDepth = pgTable(
  "analytics_scroll_depth",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sessionId: text()
      .notNull()
      .references(() => analyticsSessions.id, { onDelete: "cascade" }),
    path: text().notNull(),
    maxDepthPct: integer().notNull(),
    occurredAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    // Upsert target; the leading sessionId column indexes the FK.
    unique("analytics_scroll_depth_session_path_uq").on(t.sessionId, t.path),
    index("analytics_scroll_depth_path_occurred_idx").on(t.path, t.occurredAt),
    index("analytics_scroll_depth_occurred_idx").on(t.occurredAt),
    check("analytics_scroll_depth_path_chk", pathSql(t.path)),
    check("analytics_scroll_depth_pct_chk", sql`${t.maxDepthPct} between 0 and 100`),
  ],
);

// ---------------------------------------------------------------------------
// Configuration (/admin/analytics)
// ---------------------------------------------------------------------------

/**
 * Describes a utm_campaign value: friendly name, channel, dates and manually entered cost (for cost per
 * registration / enquiry). No personal data.
 */
export const analyticsCampaigns = pgTable(
  "analytics_campaigns",
  {
    id: pk(),
    /** utm_campaign value (lower-case, as normalised by the collector). */
    utmCampaign: text().notNull(),
    name: text().notNull(),
    channel: text({ enum: ANALYTICS_CAMPAIGN_CHANNELS }).notNull().default("other"),
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    /** Total spend entered by staff, in minor units of `currency`. */
    costMinor: moneyMinor(),
    currency: currencyCode().references(() => currencies.code),
    notes: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("analytics_campaigns_utm_campaign_uq").on(t.utmCampaign),
    index("analytics_campaigns_currency_idx").on(t.currency),
    index("analytics_campaigns_created_by_idx").on(t.createdByUserId),
    check(
      "analytics_campaigns_key_chk",
      sql`${t.utmCampaign} = lower(${t.utmCampaign}) and char_length(${t.utmCampaign}) between 1 and 200 and position('@' in ${t.utmCampaign}) = 0`,
    ),
    check("analytics_campaigns_name_chk", sql`btrim(${t.name}) <> ''`),
    check("analytics_campaigns_dates_chk", sql`${t.endsOn} is null or ${t.startsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
    // Cost and currency come together; never assume a currency.
    check(
      "analytics_campaigns_cost_chk",
      sql`(${t.costMinor} is null) = (${t.currency} is null) and coalesce(${t.costMinor}, 0) >= 0`,
    ),
  ],
);

/**
 * Funnel definitions (e.g. job view → application started → application submitted), evaluated over
 * analytics_events per visitor within windowDays. `key` identifies seeded funnels so seeding is idempotent.
 */
export const analyticsFunnels = pgTable(
  "analytics_funnels",
  {
    id: pk(),
    /** Stable identifier of seeded funnels; null for funnels created in the admin UI. */
    key: text(),
    name: text().notNull(),
    description: text(),
    steps: jsonb().$type<AnalyticsFunnelStep[]>().notNull(),
    windowDays: integer().notNull().default(7),
    isActive: boolean().notNull().default(true),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("analytics_funnels_key_uq").on(t.key),
    index("analytics_funnels_created_by_idx").on(t.createdByUserId),
    check("analytics_funnels_key_chk", sql`${t.key} is null or ${t.key} ~ '^[a-z][a-z0-9_]{1,62}$'`),
    check("analytics_funnels_name_chk", sql`btrim(${t.name}) <> ''`),
    // CASE guarantees jsonb_array_length only runs on arrays.
    check(
      "analytics_funnels_steps_chk",
      sql`case when jsonb_typeof(${t.steps}) = 'array' then jsonb_array_length(${t.steps}) between 2 and 20 else false end`,
    ),
    check("analytics_funnels_window_chk", sql`${t.windowDays} between 1 and 366`),
  ],
);

// ---------------------------------------------------------------------------
// Aggregates and consent receipts
// ---------------------------------------------------------------------------

/**
 * Daily roll-ups written by the analytics.aggregate task (idempotent upsert on the primary key, which is the
 * unique (date, metric, dimension, dimensionValue) tuple). `date` is the calendar day in the reporting timezone
 * (env DEFAULT_TIMEZONE, Asia/Kolkata by default). Aggregates only — kept after raw data is deleted.
 */
export const analyticsDailyMetrics = pgTable(
  "analytics_daily_metrics",
  {
    date: date({ mode: "string" }).notNull(),
    metric: text().$type<AnalyticsDailyMetric>().notNull(),
    dimension: text({ enum: ANALYTICS_DIMENSIONS }).notNull().default("all"),
    dimensionValue: text().notNull().default(""),
    value: numeric({ precision: 20, scale: 4, mode: "number" }).notNull(),
    /** When this value was (re)computed. */
    computedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "analytics_daily_metrics_pk", columns: [t.date, t.metric, t.dimension, t.dimensionValue] }),
    // Trends and top-N over a date range for one metric/dimension.
    index("analytics_daily_metrics_metric_idx").on(t.metric, t.dimension, t.date),
    check("analytics_daily_metrics_metric_chk", sql`${t.metric} ~ '^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$'`),
    check(
      "analytics_daily_metrics_dimension_chk",
      sql`(${t.dimension} = 'all') = (${t.dimensionValue} = '') and octet_length(${t.dimensionValue}) <= 1024`,
    ),
    check("analytics_daily_metrics_value_chk", sql`${t.value} >= 0`),
  ],
);

/**
 * Cookie-consent receipts (accountability for the consent banner). anonymousId is the random id stored in the
 * strictly necessary consent cookie — created even when everything is rejected, so it is not the analytics
 * visitorId. No IP address or user agent is stored. Append-only. Signed-in users' choices are also written to
 * consent_records (identity).
 */
export const analyticsConsentLogs = pgTable(
  "analytics_consent_logs",
  {
    id: pk(),
    anonymousId: text().notNull(),
    categories: jsonb().$type<AnalyticsConsentCategories>().notNull(),
    method: text({ enum: ANALYTICS_CONSENT_METHODS }).notNull(),
    /** Version of the cookie / privacy notice the visitor saw. */
    policyVersion: text().notNull(),
    /** Language the banner was shown in. */
    locale: text(),
    ...createdAtOnly,
  },
  (t) => [
    index("analytics_consent_logs_anon_idx").on(t.anonymousId, t.createdAt),
    index("analytics_consent_logs_created_idx").on(t.createdAt),
    check("analytics_consent_logs_anon_chk", randomIdSql(t.anonymousId)),
    check("analytics_consent_logs_categories_chk", sql`jsonb_typeof(${t.categories}) = 'object'`),
    check(
      "analytics_consent_logs_fields_chk",
      sql`char_length(${t.policyVersion}) between 1 and 50 and (${t.locale} is null or char_length(${t.locale}) <= 35)`,
    ),
  ],
);
