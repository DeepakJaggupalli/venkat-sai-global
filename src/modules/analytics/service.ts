import "server-only";

import { and, asc, eq, gte, lt, lte, ne } from "drizzle-orm";

import { db } from "@/db";
import { analyticsCampaigns, analyticsDailyMetrics, analyticsEvents, analyticsFunnels, analyticsSessions, currencies } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { toMinorUnits } from "@/lib/format";
import { toCsv } from "@/lib/http";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertAnalyticsPermission, assertRange, rangeBounds } from "./access";
import { validateFunnelSteps } from "./funnel-rules";
import type { AnalyticsRange } from "./range";
import { campaignFormSchema, funnelFormSchema, type CampaignFormInput, type ExportDataset, type FunnelFormInput } from "./schemas";

/**
 * Analytics configuration writes for the Command Centre (analytics.configure) and CSV exports
 * (analytics.export). Every change is audited.
 */

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return (e?.code === "23505" && e.constraint === constraint) || (e?.cause?.code === "23505" && e.cause.constraint === constraint);
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** Create or update a campaign description / manual cost (cost typed in major units of its currency). */
export async function saveCampaign(staff: StaffContext, rawInput: CampaignFormInput): Promise<{ id: string; created: boolean }> {
  assertAnalyticsPermission(staff, "analytics.configure");
  const input = campaignFormSchema.parse(rawInput);
  let costMinor: number | null = null;
  let currency: string | null = null;
  if (input.cost !== undefined && input.currency) {
    const [cur] = await db.select({ code: currencies.code, isActive: currencies.isActive }).from(currencies).where(eq(currencies.code, input.currency)).limit(1);
    if (!cur) throw new ActionError("Choose a valid currency.", { fieldErrors: { currency: ["Choose a valid currency"] } });
    currency = cur.code;
    costMinor = toMinorUnits(input.cost, cur.code);
    if (!Number.isSafeInteger(costMinor)) throw new ActionError("The cost is too large.", { fieldErrors: { cost: ["The cost is too large"] } });
  }
  const values = {
    utmCampaign: input.utmCampaign,
    name: input.name,
    channel: input.channel,
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    costMinor,
    currency,
    notes: input.notes ?? null,
  };
  try {
    return await db.transaction(async (tx) => {
      if (input.id) {
        const [before] = await tx.select().from(analyticsCampaigns).where(eq(analyticsCampaigns.id, input.id)).limit(1);
        if (!before) throw new ActionError("Campaign not found.", { code: "not_found" });
        await tx.update(analyticsCampaigns).set({ ...values, updatedAt: new Date() }).where(eq(analyticsCampaigns.id, input.id));
        await audit({
          action: "analytics.campaign_updated",
          entityType: "analytics_campaign",
          entityId: input.id,
          actorUserId: staff.user.id,
          actorType: "staff",
          metadata: {
            utmCampaign: values.utmCampaign,
            costChanged: before.costMinor !== values.costMinor || before.currency !== values.currency,
            costMinor: values.costMinor,
            currency: values.currency,
          },
          tx,
        });
        return { id: input.id, created: false };
      }
      const [row] = await tx
        .insert(analyticsCampaigns)
        .values({ ...values, createdByUserId: staff.user.id })
        .returning({ id: analyticsCampaigns.id });
      await audit({
        action: "analytics.campaign_created",
        entityType: "analytics_campaign",
        entityId: row!.id,
        actorUserId: staff.user.id,
        actorType: "staff",
        metadata: { utmCampaign: values.utmCampaign, costMinor: values.costMinor, currency: values.currency },
        tx,
      });
      return { id: row!.id, created: true };
    });
  } catch (error) {
    if (isUniqueViolation(error, "analytics_campaigns_utm_campaign_uq")) {
      throw new ActionError("A campaign with this utm_campaign value already exists.", { fieldErrors: { utmCampaign: ["Already described"] } });
    }
    throw error;
  }
}

export async function deleteCampaign(staff: StaffContext, id: string): Promise<void> {
  assertAnalyticsPermission(staff, "analytics.configure");
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(analyticsCampaigns).where(eq(analyticsCampaigns.id, id)).returning({ utmCampaign: analyticsCampaigns.utmCampaign });
    if (!row) throw new ActionError("Campaign not found.", { code: "not_found" });
    await audit({
      action: "analytics.campaign_deleted",
      entityType: "analytics_campaign",
      entityId: id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { utmCampaign: row.utmCampaign },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Funnels
// ---------------------------------------------------------------------------

function stepsFromForm(input: FunnelFormInput): { label: string; match: { event?: string; path?: string; props?: Record<string, string | number | boolean> } }[] {
  return input.steps.map((s) => ({
    label: s.label,
    match: {
      ...(s.event ? { event: s.event } : {}),
      ...(s.path ? { path: s.path } : {}),
      ...(s.props && Object.keys(s.props).length ? { props: s.props } : {}),
    },
  }));
}

/** Create or update a funnel. Seeded funnels (with a key) keep their key. */
export async function saveFunnel(staff: StaffContext, rawInput: FunnelFormInput): Promise<{ id: string; created: boolean }> {
  assertAnalyticsPermission(staff, "analytics.configure");
  const input = funnelFormSchema.parse(rawInput);
  const steps = stepsFromForm(input);
  if (!validateFunnelSteps(steps)) throw new ActionError("Check the funnel steps.", { fieldErrors: { steps: ["Each step needs a name and an event or path"] } });
  const values = { name: input.name, description: input.description ?? null, steps, windowDays: input.windowDays, isActive: input.isActive };
  return db.transaction(async (tx) => {
    if (input.id) {
      const [updated] = await tx
        .update(analyticsFunnels)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(analyticsFunnels.id, input.id))
        .returning({ id: analyticsFunnels.id, key: analyticsFunnels.key });
      if (!updated) throw new ActionError("Funnel not found.", { code: "not_found" });
      await audit({
        action: "analytics.funnel_updated",
        entityType: "analytics_funnel",
        entityId: updated.id,
        actorUserId: staff.user.id,
        actorType: "staff",
        metadata: { name: values.name, steps: steps.length, windowDays: values.windowDays, isActive: values.isActive, key: updated.key },
        tx,
      });
      return { id: updated.id, created: false };
    }
    const [row] = await tx.insert(analyticsFunnels).values({ ...values, createdByUserId: staff.user.id }).returning({ id: analyticsFunnels.id });
    await audit({
      action: "analytics.funnel_created",
      entityType: "analytics_funnel",
      entityId: row!.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { name: values.name, steps: steps.length, windowDays: values.windowDays },
      tx,
    });
    return { id: row!.id, created: true };
  });
}

export async function setFunnelActive(staff: StaffContext, id: string, isActive: boolean): Promise<void> {
  assertAnalyticsPermission(staff, "analytics.configure");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(analyticsFunnels)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(analyticsFunnels.id, id), ne(analyticsFunnels.isActive, isActive)))
      .returning({ id: analyticsFunnels.id });
    if (!row) {
      const [exists] = await tx.select({ id: analyticsFunnels.id }).from(analyticsFunnels).where(eq(analyticsFunnels.id, id)).limit(1);
      if (!exists) throw new ActionError("Funnel not found.", { code: "not_found" });
      return;
    }
    await audit({
      action: isActive ? "analytics.funnel_activated" : "analytics.funnel_deactivated",
      entityType: "analytics_funnel",
      entityId: id,
      actorUserId: staff.user.id,
      actorType: "staff",
      tx,
    });
  });
}

/** Delete a funnel created in the admin. Seeded funnels (with a key) can only be deactivated. */
export async function deleteFunnel(staff: StaffContext, id: string): Promise<void> {
  assertAnalyticsPermission(staff, "analytics.configure");
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ key: analyticsFunnels.key, name: analyticsFunnels.name }).from(analyticsFunnels).where(eq(analyticsFunnels.id, id)).limit(1);
    if (!row) throw new ActionError("Funnel not found.", { code: "not_found" });
    if (row.key) throw new ActionError("Default funnels cannot be deleted. Deactivate it instead.", { code: "seeded_funnel" });
    await tx.delete(analyticsFunnels).where(eq(analyticsFunnels.id, id));
    await audit({
      action: "analytics.funnel_deleted",
      entityType: "analytics_funnel",
      entityId: id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { name: row.name },
      tx,
    });
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Maximum rows in one CSV export. */
export const EXPORT_ROW_LIMIT = 50_000;

export type AnalyticsExport = { filename: string; csv: string; rows: number; truncated: boolean };

/**
 * CSV export (analytics.export) of pseudonymous data for a range: `events` (no visitor or user ids),
 * `sessions` (no visitor or user ids) or `daily_metrics`. Audited as `analytics.exported`.
 */
export async function exportAnalyticsCsv(staff: StaffContext, dataset: ExportDataset, range: AnalyticsRange): Promise<AnalyticsExport> {
  assertAnalyticsPermission(staff, "analytics.export");
  assertRange(range);
  const { start, end } = rangeBounds(range.from, range.to, range.timeZone);
  let csv: string;
  let rows: number;
  if (dataset === "events") {
    const data = await db
      .select({
        occurredAt: analyticsEvents.occurredAt,
        name: analyticsEvents.name,
        source: analyticsEvents.source,
        path: analyticsEvents.path,
        props: analyticsEvents.props,
        sessionId: analyticsEvents.sessionId,
      })
      .from(analyticsEvents)
      .where(and(gte(analyticsEvents.occurredAt, start), lt(analyticsEvents.occurredAt, end)))
      .orderBy(asc(analyticsEvents.occurredAt))
      .limit(EXPORT_ROW_LIMIT + 1);
    rows = Math.min(data.length, EXPORT_ROW_LIMIT);
    csv = toCsv(
      data.slice(0, EXPORT_ROW_LIMIT).map((r) => ({ ...r, props: JSON.stringify(r.props) })),
      [
        { key: "occurredAt", header: "occurred_at" },
        { key: "name", header: "event" },
        { key: "source", header: "source" },
        { key: "path", header: "path" },
        { key: "props", header: "props" },
        { key: "sessionId", header: "session_id" },
      ],
    );
    return finishExport(staff, dataset, range, csv, rows, data.length > EXPORT_ROW_LIMIT);
  }
  if (dataset === "sessions") {
    const data = await db
      .select({
        id: analyticsSessions.id,
        startedAt: analyticsSessions.startedAt,
        lastSeenAt: analyticsSessions.lastSeenAt,
        landingPath: analyticsSessions.landingPath,
        exitPath: analyticsSessions.exitPath,
        referrerDomain: analyticsSessions.referrerDomain,
        utmSource: analyticsSessions.utmSource,
        utmMedium: analyticsSessions.utmMedium,
        utmCampaign: analyticsSessions.utmCampaign,
        deviceType: analyticsSessions.deviceType,
        browser: analyticsSessions.browser,
        os: analyticsSessions.os,
        countryCode: analyticsSessions.countryCode,
        locale: analyticsSessions.locale,
        isNewVisitor: analyticsSessions.isNewVisitor,
        pageViews: analyticsSessions.pageViews,
        events: analyticsSessions.events,
        isBounce: analyticsSessions.isBounce,
        durationSeconds: analyticsSessions.durationSeconds,
        consentLevel: analyticsSessions.consentLevel,
      })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lt(analyticsSessions.startedAt, end)))
      .orderBy(asc(analyticsSessions.startedAt))
      .limit(EXPORT_ROW_LIMIT + 1);
    rows = Math.min(data.length, EXPORT_ROW_LIMIT);
    csv = toCsv(data.slice(0, EXPORT_ROW_LIMIT), [
      { key: "id", header: "session_id" },
      { key: "startedAt", header: "started_at" },
      { key: "lastSeenAt", header: "last_seen_at" },
      { key: "landingPath", header: "landing_path" },
      { key: "exitPath", header: "exit_path" },
      { key: "referrerDomain", header: "referrer_domain" },
      { key: "utmSource", header: "utm_source" },
      { key: "utmMedium", header: "utm_medium" },
      { key: "utmCampaign", header: "utm_campaign" },
      { key: "deviceType", header: "device_type" },
      { key: "browser", header: "browser" },
      { key: "os", header: "os" },
      { key: "countryCode", header: "country" },
      { key: "locale", header: "locale" },
      { key: "isNewVisitor", header: "new_visitor" },
      { key: "pageViews", header: "page_views" },
      { key: "events", header: "events" },
      { key: "isBounce", header: "bounce" },
      { key: "durationSeconds", header: "duration_seconds" },
      { key: "consentLevel", header: "consent_level" },
    ]);
    return finishExport(staff, dataset, range, csv, rows, data.length > EXPORT_ROW_LIMIT);
  }
  const data = await db
    .select()
    .from(analyticsDailyMetrics)
    .where(and(gte(analyticsDailyMetrics.date, range.from), lte(analyticsDailyMetrics.date, range.to)))
    .orderBy(asc(analyticsDailyMetrics.date), asc(analyticsDailyMetrics.metric), asc(analyticsDailyMetrics.dimension), asc(analyticsDailyMetrics.dimensionValue))
    .limit(EXPORT_ROW_LIMIT + 1);
  rows = Math.min(data.length, EXPORT_ROW_LIMIT);
  csv = toCsv(data.slice(0, EXPORT_ROW_LIMIT), [
    { key: "date", header: "date" },
    { key: "metric", header: "metric" },
    { key: "dimension", header: "dimension" },
    { key: "dimensionValue", header: "dimension_value" },
    { key: "value", header: "value" },
    { key: "computedAt", header: "computed_at" },
  ]);
  return finishExport(staff, dataset, range, csv, rows, data.length > EXPORT_ROW_LIMIT);
}

async function finishExport(staff: StaffContext, dataset: ExportDataset, range: AnalyticsRange, csv: string, rows: number, truncated: boolean): Promise<AnalyticsExport> {
  await audit({
    action: "analytics.exported",
    entityType: "analytics_export",
    entityId: dataset,
    actorUserId: staff.user.id,
    actorType: "staff",
    metadata: { dataset, from: range.from, to: range.to, rows, truncated },
  });
  return { filename: `analytics-${dataset}-${range.from}-to-${range.to}.csv`, csv, rows, truncated };
}
