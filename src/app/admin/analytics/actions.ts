"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { previewFunnel } from "@/modules/analytics/funnels";
import { FUNNEL_GROUPINGS, funnelStepSchema, RANGE_PRESETS } from "@/modules/analytics/schemas";
import { getSessionTimeline } from "@/modules/analytics/sessions";
import type { FunnelResult, SessionTimeline } from "@/modules/analytics/types";
import { audit } from "@/modules/audit";
import { requireStaff } from "@/modules/identity/authz";
import { getSettings, listFeatureFlags, setFeatureFlag, setSetting } from "@/modules/settings";

/**
 * Route-local Server Actions for /admin/analytics that the analytics module does not provide:
 * funnel preview (builder), session diagnostics with a mandatory reason, and analytics settings.
 * Campaign and funnel writes use the module's own actions (@/modules/analytics/actions).
 */

const ANALYTICS_PATH = "/admin/analytics";

// ---------------------------------------------------------------------------
// Funnel preview
// ---------------------------------------------------------------------------

const previewSchema = z.object({
  steps: z.array(funnelStepSchema).min(2, "A funnel needs at least two steps").max(20, "A funnel can have at most 20 steps"),
  windowDays: z.coerce.number().int().min(1).max(366),
  groupBy: z.enum(FUNNEL_GROUPINGS).default("visitor"),
  range: z.enum(RANGE_PRESETS).default("30d"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const previewFunnelAction = createAction(previewSchema, async (input) => {
  const staff = await requireStaff("analytics.view");
  const range = getAnalyticsRange({ range: input.range, from: input.from, to: input.to });
  const steps = input.steps.map((s) => ({
    label: s.label,
    match: {
      ...(s.event ? { event: s.event } : {}),
      ...(s.path ? { path: s.path } : {}),
      ...(s.props && Object.keys(s.props).length ? { props: s.props } : {}),
    },
  }));
  const result: FunnelResult = await previewFunnel(staff, { steps, windowDays: input.windowDays }, range, { groupBy: input.groupBy });
  return ok(result);
});

// ---------------------------------------------------------------------------
// Session diagnostics (analytics.sessions; reason required; logged by the module)
// ---------------------------------------------------------------------------

const timelineSchema = z.object({
  sessionId: z.string().trim().min(8).max(64),
  reason: z.string({ error: "Give a reason for opening this session" }).trim().min(10, "Describe the reason in at least 10 characters").max(500, "Keep the reason under 500 characters"),
});

export const openSessionTimelineAction = createAction(timelineSchema, async ({ sessionId, reason }) => {
  const staff = await requireStaff("analytics.sessions");
  const timeline: SessionTimeline = await getSessionTimeline(sessionId, staff, { reason });
  return ok(timeline);
});

// ---------------------------------------------------------------------------
// Settings (retention, optional third-party services, feature flags)
// ---------------------------------------------------------------------------

const retention = (min: number) => f.int({ min, max: 3650 });

const settingsSchema = z
  .object({
    retentionEvents: retention(30),
    retentionSessions: retention(30),
    retentionHeatmaps: retention(7),
    clarityProjectId: z
      .string()
      .trim()
      .regex(/^[a-z0-9]{6,20}$/i, "Enter the Clarity project ID (6–20 letters and numbers)")
      .optional(),
    ga4MeasurementId: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^G-[A-Z0-9]{4,20}$/, "Enter a GA4 measurement ID such as G-AB12CD34EF")
      .optional(),
    firstParty: f.bool(),
    heatmaps: f.bool(),
    clarity: f.bool(),
    ga4: f.bool(),
  })
  .superRefine((v, ctx) => {
    if (v.clarity && !v.clarityProjectId) ctx.addIssue({ code: "custom", path: ["clarityProjectId"], message: "Enter the project ID before switching Clarity on" });
    if (v.ga4 && !v.ga4MeasurementId) ctx.addIssue({ code: "custom", path: ["ga4MeasurementId"], message: "Enter the measurement ID before switching GA4 on" });
    if (v.heatmaps && !v.firstParty) ctx.addIssue({ code: "custom", path: ["heatmaps"], message: "Heatmaps need first-party analytics to be on" });
  });

export const saveAnalyticsSettingsAction = createFormAction(settingsSchema, async (input) => {
  const staff = await requireStaff("analytics.configure");
  const before = await getSettings([
    "analytics.retention_days_events",
    "analytics.retention_days_sessions",
    "analytics.retention_days_heatmaps",
    "analytics.clarity_project_id",
    "analytics.ga4_measurement_id",
  ]);
  const flagsBefore = new Map((await listFeatureFlags()).map((fl) => [fl.key, fl.enabled]));

  const next = {
    "analytics.retention_days_events": input.retentionEvents,
    "analytics.retention_days_sessions": input.retentionSessions,
    "analytics.retention_days_heatmaps": input.retentionHeatmaps,
    "analytics.clarity_project_id": input.clarityProjectId ?? "",
    "analytics.ga4_measurement_id": input.ga4MeasurementId ?? "",
  } as const;
  const changedSettings = (Object.keys(next) as (keyof typeof next)[]).filter((key) => before[key] !== next[key]);

  const flagChanges = (
    [
      ["analytics.first_party", input.firstParty],
      ["analytics.heatmaps", input.heatmaps],
      ["analytics.clarity", input.clarity],
      ["analytics.ga4", input.ga4],
    ] as const
  ).filter(([key, enabled]) => flagsBefore.get(key) !== enabled);

  if (!changedSettings.length && !flagChanges.length) return ok(undefined, "No changes to save");

  const changed = new Set(changedSettings);
  if (changed.has("analytics.retention_days_events")) await setSetting("analytics.retention_days_events", next["analytics.retention_days_events"], staff.user.id);
  if (changed.has("analytics.retention_days_sessions")) await setSetting("analytics.retention_days_sessions", next["analytics.retention_days_sessions"], staff.user.id);
  if (changed.has("analytics.retention_days_heatmaps")) await setSetting("analytics.retention_days_heatmaps", next["analytics.retention_days_heatmaps"], staff.user.id);
  if (changed.has("analytics.clarity_project_id")) await setSetting("analytics.clarity_project_id", next["analytics.clarity_project_id"], staff.user.id);
  if (changed.has("analytics.ga4_measurement_id")) await setSetting("analytics.ga4_measurement_id", next["analytics.ga4_measurement_id"], staff.user.id);
  for (const [key, enabled] of flagChanges) await setFeatureFlag(key, enabled, staff.user.id);

  await audit({
    action: "analytics.settings_updated",
    entityType: "platform_setting",
    entityId: null,
    actorUserId: staff.user.id,
    actorType: "staff",
    metadata: {
      settings: changedSettings,
      flags: Object.fromEntries(flagChanges.map(([key, enabled]) => [key, enabled])),
    },
  });
  revalidatePath(ANALYTICS_PATH, "layout");
  return ok(undefined, "Analytics settings saved");
});

