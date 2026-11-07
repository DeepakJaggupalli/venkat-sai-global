/**
 * Zod schemas for the analytics module (client-safe: no server imports).
 *  - collector payload (POST /api/v1/collect) and consent receipts (POST /api/v1/consent);
 *  - admin forms (campaigns, funnels) and dashboard filters.
 */
import { z } from "zod";

import { f } from "@/lib/validation";

import { CONSENT_METHODS, CONSENT_SOURCES, RANDOM_ID_RE } from "./consent";
import { COLLECT_LIMITS } from "./limits";

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

export { COLLECT_LIMITS };

const randomId = z.string().regex(RANDOM_ID_RE);
/** Raw path from the browser; the collector normalises it again (never trusted). */
const rawPath = z.string().min(1).max(2048);
const clientTs = z.number().int().nonnegative();
const shortLabel = z.string().max(200);

export const VIEWPORT_BUCKETS = ["mobile", "tablet", "desktop"] as const;
export const HEATMAP_KINDS = ["click", "dead_click", "rage_click"] as const;

export const collectEventSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  path: rawPath,
  props: z.record(z.string().max(64), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])).optional(),
  ts: clientTs,
});

export const collectHeatmapPointSchema = z.object({
  path: rawPath,
  vw: z.enum(VIEWPORT_BUCKETS),
  x: z.number().int().min(0).max(1000),
  y: z.number().int().min(0).max(1_000_000),
  h: z.number().int().min(1).max(1_000_000),
  sel: z.string().max(512).nullish(),
  kind: z.enum(HEATMAP_KINDS),
  ts: clientTs,
});

export const collectScrollSchema = z.object({
  path: rawPath,
  depth: z.number().int().min(0).max(100),
  ts: clientTs,
});

/** Sent with the first batch of a session (landing page, referrer domain, UTM, UI language). */
export const collectSessionStartSchema = z.object({
  landingPath: rawPath,
  referrer: z.string().max(253).nullish(),
  utm: z
    .object({ source: shortLabel, medium: shortLabel, campaign: shortLabel, term: shortLabel, content: shortLabel })
    .partial()
    .nullish(),
  locale: z
    .string()
    .max(35)
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
    .nullish(),
  newVisitor: z.boolean().optional(),
});

export const collectPayloadSchema = z
  .object({
    v: z.literal(1),
    /** Analytics session id (random, rotated after 30 minutes of inactivity). */
    sid: randomId,
    /** Visitor id (random, first-party, kept with analytics consent only). */
    vid: randomId.optional(),
    /** Client clock when the batch was sent (used to correct event times for clock skew). */
    sentAt: clientTs,
    start: collectSessionStartSchema.optional(),
    events: z.array(collectEventSchema).max(COLLECT_LIMITS.maxEvents).default([]),
    heatmap: z.array(collectHeatmapPointSchema).max(COLLECT_LIMITS.maxHeatmapPoints).default([]),
    scroll: z.array(collectScrollSchema).max(COLLECT_LIMITS.maxScrollRecords).default([]),
  })
  .refine((p) => p.start !== undefined || p.events.length > 0 || p.heatmap.length > 0 || p.scroll.length > 0, {
    error: "Empty batch",
  });

export type CollectPayload = z.output<typeof collectPayloadSchema>;
export type CollectPayloadInput = z.input<typeof collectPayloadSchema>;
export type CollectEvent = z.output<typeof collectEventSchema>;
export type CollectHeatmapPoint = z.output<typeof collectHeatmapPointSchema>;
export type CollectScroll = z.output<typeof collectScrollSchema>;

// ---------------------------------------------------------------------------
// Consent receipts
// ---------------------------------------------------------------------------

export const consentReceiptSchema = z.object({
  version: z.string().regex(/^[A-Za-z0-9._:-]{1,50}$/),
  categories: z.object({ functional: z.boolean(), analytics: z.boolean(), session_insights: z.boolean() }),
  anonymousId: randomId,
  method: z.enum(CONSENT_METHODS),
  source: z.enum(CONSENT_SOURCES).default("cookie_banner"),
  locale: z
    .string()
    .max(35)
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
    .optional(),
  /** Browser sent a Global Privacy Control signal when the choice was made. */
  gpc: z.boolean().optional(),
});
export type ConsentReceiptInput = z.output<typeof consentReceiptSchema>;

// ---------------------------------------------------------------------------
// Dashboard filters
// ---------------------------------------------------------------------------

export const RANGE_PRESETS = ["today", "yesterday", "7d", "30d", "90d", "12m", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

export const analyticsRangeInputSchema = z.object({
  range: z.enum(RANGE_PRESETS).catch("30d").default("30d"),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
});
export type AnalyticsRangeInput = z.input<typeof analyticsRangeInputSchema>;

export const eventsFilterSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,63}$/)
    .optional()
    .catch(undefined),
  path: z.string().max(1024).optional().catch(undefined),
  source: z.enum(["client", "server"]).optional().catch(undefined),
});
export type EventsFilter = z.output<typeof eventsFilterSchema>;

export const heatmapQuerySchema = z.object({
  path: z.string().min(1).max(1024),
  viewport: z.enum(VIEWPORT_BUCKETS).default("desktop"),
  kind: z.enum(HEATMAP_KINDS).optional(),
});
export type HeatmapQuery = z.input<typeof heatmapQuerySchema>;

export const FUNNEL_GROUPINGS = ["visitor", "session"] as const;
export type FunnelGrouping = (typeof FUNNEL_GROUPINGS)[number];

// ---------------------------------------------------------------------------
// Admin forms
// ---------------------------------------------------------------------------

export const CAMPAIGN_CHANNEL_OPTIONS = [
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

/** Campaign description + manual cost entry. Cost is typed in major units of `currency`. */
export const campaignFormSchema = z
  .object({
    id: f.optionalUuid(),
    utmCampaign: z
      .string({ error: "Enter the utm_campaign value" })
      .trim()
      .toLowerCase()
      .min(1, "Enter the utm_campaign value")
      .max(200, "Too long")
      .refine((v) => !v.includes("@"), "A campaign key cannot contain @"),
    name: f.text({ max: 200, label: "Name" }),
    channel: f.enumOf(CAMPAIGN_CHANNEL_OPTIONS),
    startsOn: isoDate.optional(),
    endsOn: isoDate.optional(),
    cost: f.optionalAmount(),
    currency: z.string().trim().length(3, "Choose a currency").toUpperCase().optional(),
    notes: f.longText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date must be on or after the start date" });
    }
    if (v.cost !== undefined && !v.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose the currency of the cost" });
    if (v.cost === undefined && v.currency) ctx.addIssue({ code: "custom", path: ["cost"], message: "Enter the cost, or clear the currency" });
  });
export type CampaignFormInput = z.output<typeof campaignFormSchema>;

const funnelPropValue = z.union([z.string().trim().min(1).max(100), z.number(), z.boolean()]);

export const funnelStepSchema = z
  .object({
    label: z.string().trim().min(1, "Name the step").max(80, "Too long"),
    event: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,63}$/, "Choose an event")
      .optional(),
    /** Exact path ("/jobs"), or a prefix ending in "*" ("/jobs/*"). */
    path: z
      .string()
      .trim()
      .max(300)
      .regex(/^\/[^?#\s]*$/, "A path starts with / and has no query string")
      .optional(),
    props: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/), funnelPropValue).optional(),
  })
  .refine((s) => s.event !== undefined || s.path !== undefined, { error: "Match an event, a path or both", path: ["event"] });

export const funnelFormSchema = z.object({
  id: f.optionalUuid(),
  name: f.text({ max: 120, label: "Name" }),
  description: f.optionalText(500),
  windowDays: f.int({ min: 1, max: 366 }).default(7),
  isActive: f.bool(),
  steps: z.array(funnelStepSchema).min(2, "A funnel needs at least two steps").max(20, "A funnel can have at most 20 steps"),
});
export type FunnelFormInput = z.output<typeof funnelFormSchema>;

export const idSchema = z.object({ id: z.uuid() });
export const funnelActiveSchema = z.object({ id: z.uuid(), isActive: z.boolean() });

export const EXPORT_DATASETS = ["events", "daily_metrics", "sessions"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
