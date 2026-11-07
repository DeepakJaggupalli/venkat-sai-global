/**
 * Result types of the analytics read API (client-safe). All counts are integers; rates are fractions
 * 0–1; durations are seconds; money is integer minor units with its currency.
 */
import type { AnalyticsFunnelStep } from "@/db/schema/analytics";

import type { AnalyticsRange } from "./range";
import type { ViewportBucket } from "./privacy-rules";

export type { AnalyticsFunnelStep } from "@/db/schema/analytics";
export type { AnalyticsRange } from "./range";

/** Headline numbers for one period. */
export type AnalyticsKpis = {
  sessions: number;
  visitors: number;
  newVisitors: number;
  pageViews: number;
  bounceRate: number;
  avgSessionDuration: number;
  pagesPerSession: number;
  conversions: number;
  /** Sessions with at least one conversion ÷ sessions. */
  conversionRate: number;
};

export type AnalyticsOverview = {
  range: AnalyticsRange;
  current: AnalyticsKpis;
  previous: AnalyticsKpis;
  /** Relative change per KPI (null when the previous value is 0). */
  change: Record<keyof AnalyticsKpis, number | null>;
};

export type TimeSeriesPoint = {
  date: string;
  sessions: number;
  visitors: number;
  pageViews: number;
  conversions: number;
  bounceRate: number;
};

export type PageRow = { path: string; pageViews: number; sessions: number; avgScrollDepth: number | null };
export type LandingPageRow = { path: string; sessions: number; bounceRate: number; avgSessionDuration: number; conversions: number };
export type ExitPageRow = { path: string; exits: number; pageViews: number; exitRate: number };

export type SourceRow = { source: string; medium: string; sessions: number; visitors: number; bounceRate: number; conversions: number };
export type ReferrerRow = { referrerDomain: string; sessions: number; visitors: number; conversions: number };

export type CampaignRow = {
  utmCampaign: string;
  campaignId: string | null;
  name: string | null;
  channel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  sessions: number;
  visitors: number;
  conversions: number;
  /** Conversions per key event over the whole retained history of the campaign (for cost per acquisition). */
  lifetimeConversions: Record<string, number>;
  lifetimeConversionTotal: number;
  costMinor: number | null;
  currency: string | null;
  /** costMinor ÷ lifetime conversions (minor units, rounded), null without cost or conversions. */
  costPerConversionMinor: number | null;
  /** Same, per key event. */
  costPerEventMinor: Record<string, number | null>;
};

export type BreakdownRow = { value: string; sessions: number; visitors: number; share: number };
export type TechBreakdown = { devices: BreakdownRow[]; browsers: BreakdownRow[]; operatingSystems: BreakdownRow[] };
export type CountryRow = { countryCode: string | null; countryName: string | null; sessions: number; visitors: number; share: number };

export type ActiveVisitors = {
  /** Sessions seen in the last 5 minutes. */
  sessions: number;
  pages: { path: string; sessions: number }[];
  asOf: Date;
};

export type EventCountRow = { name: string; label: string; count: number; sessions: number; isConversion: boolean };
export type EventRow = {
  id: number;
  name: string;
  source: "client" | "server";
  path: string | null;
  props: Record<string, string | number | boolean | null>;
  occurredAt: Date;
  /** Only for staff holding analytics.sessions (links to the session timeline). */
  sessionId: string | null;
};

export type FunnelDefinition = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  steps: AnalyticsFunnelStep[];
  windowDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type FunnelStepResult = {
  index: number;
  label: string;
  match: AnalyticsFunnelStep["match"];
  /** Visitors (or sessions) that reached this step in order. */
  count: number;
  /** count ÷ first-step count. */
  conversionFromStart: number;
  /** count ÷ previous-step count (1 for the first step). */
  conversionFromPrevious: number;
  /** Previous-step count − count (0 for the first step). */
  dropOff: number;
  dropOffRate: number;
};

export type FunnelResult = {
  range: AnalyticsRange;
  groupBy: "visitor" | "session";
  windowDays: number;
  steps: FunnelStepResult[];
  entered: number;
  completed: number;
  overallConversion: number;
};

export type FormAnalyticsRow = { formId: string; started: number; submitted: number; completionRate: number; abandonmentRate: number };

export type SearchAnalytics = {
  searches: number;
  categories: { value: string; count: number }[];
  filterKeys: { key: string; count: number }[];
  listingPageViews: number;
};

export type HeatmapCell = {
  /** Per mille of document width (left edge of a 10‰ bucket). */
  x: number;
  /** Document y in CSS pixels (top of a 25 px bucket). */
  y: number;
  count: number;
};

export type HeatmapSelectorRow = { selector: string; clicks: number; rageClicks: number; deadClicks: number };

export type HeatmapResult = {
  path: string;
  viewport: ViewportBucket;
  range: AnalyticsRange;
  totals: { clicks: number; rageClicks: number; deadClicks: number };
  /** 90th percentile document height of the recorded points (canvas height for the overlay). */
  docHeight: number | null;
  cells: HeatmapCell[];
  topSelectors: HeatmapSelectorRow[];
  /** Share of sessions (that recorded scroll depth on the page) reaching each milestone. */
  scroll: { sessions: number; avgMaxDepth: number | null; reach: { depth: number; sessions: number; share: number }[] };
};

export type HeatmapPageRow = { path: string; clicks: number };

export type CtaRow = { cta: string; clicks: number; sessions: number; convertedSessions: number; conversionRate: number; locations: string[] };

export type SessionListRow = {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
  landingPath: string | null;
  exitPath: string | null;
  source: string;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  countryCode: string | null;
  pageViews: number;
  events: number;
  durationSeconds: number;
  isBounce: boolean;
  isSignedIn: boolean;
  consentLevel: string;
};

export type SessionTimeline = {
  session: SessionListRow & {
    visitorId: string | null;
    userId: string | null;
    referrerDomain: string | null;
    utm: { source: string | null; medium: string | null; campaign: string | null; term: string | null; content: string | null };
    locale: string | null;
    isNewVisitor: boolean;
  };
  events: { id: number; name: string; source: string; path: string | null; props: Record<string, string | number | boolean | null>; occurredAt: Date }[];
  scroll: { path: string; maxDepthPct: number; occurredAt: Date }[];
};

export type DailyMetricPoint = { date: string; value: number };

export type CampaignDefinition = {
  id: string;
  utmCampaign: string;
  name: string;
  channel: string;
  startsOn: string | null;
  endsOn: string | null;
  costMinor: number | null;
  currency: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Props for the client tracker (computed by the server wrapper). */
export type AnalyticsClientConfig = {
  /** First-party tracking allowed for this visitor (flag on, not staff, not a minor). */
  enabled: boolean;
  heatmaps: boolean;
  consentVersion: string;
  clarityProjectId: string | null;
  ga4MeasurementId: string | null;
  nonce: string | null;
};

/** Optional third-party services disclosed on the consent banner / preferences form. */
export type ConsentServices = { ga4: boolean; clarity: boolean };
