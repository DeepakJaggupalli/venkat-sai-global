import "server-only";

import { and, asc, countDistinct, count, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateProfiles, courses, jobs, organizations, placements, publicMetrics, users, type PublicMetricKey, type StandardPublicMetricKey } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { ACTIVE_EMPLOYER_WINDOW_DAYS, LIVE_METRIC_MAX_AGE_MINUTES, STANDARD_PUBLIC_METRIC_LABELS, STANDARD_PUBLIC_METRIC_VALUES } from "./constants";
import { assertStaff, rethrowConstraint } from "./internal";
import { prepareEvidenceFile } from "./media";
import { displayableMetric, manualApprovalIsCurrent } from "./metric-rules";
import type { CustomMetricInput, ManualMetricValueInput, UpdateMetricInput } from "./schemas";
import type { AdminMetricItem, PublicMetric, PublicMetricRow } from "./types";

/**
 * Public credibility counters (spec 7.3). Live counters are computed in code from real tables (read-only
 * queries on other modules' tables); manual figures need an approved snapshot with evidence and an as-of date.
 * `getPublicMetrics()` returns only what may be shown. All metrics are seeded hidden.
 */

type Tx = DbOrTx;

export type LiveMetricDefinition = {
  key: StandardPublicMetricKey;
  label: string;
  /** Public explanation of exactly what is counted (seeded into public_metrics.definition). */
  definition: string;
  compute(tx: Tx, now: Date): Promise<number>;
};

async function scalar(query: Promise<{ value: number | string | null }[]>): Promise<number> {
  const [row] = await query;
  return Number(row?.value ?? 0);
}

const verifiedOrgs = (tx: Tx, type: "employer" | "recruitment_partner" | "institution") =>
  scalar(tx.select({ value: count() }).from(organizations).where(and(eq(organizations.type, type), eq(organizations.status, "verified"), isNull(organizations.deletedAt))));

/** The live counters, keyed by public_metrics.liveQueryKey. */
export const LIVE_METRICS: Record<StandardPublicMetricKey, LiveMetricDefinition> = {
  registered_candidates: {
    key: "registered_candidates",
    label: STANDARD_PUBLIC_METRIC_LABELS.registered_candidates,
    definition: "Candidate profiles on Venkat Sai Global that belong to an active, verified account.",
    compute: (tx) =>
      scalar(
        tx
          .select({ value: count() })
          .from(candidateProfiles)
          .innerJoin(users, eq(users.id, candidateProfiles.userId))
          .where(and(isNull(candidateProfiles.deletedAt), eq(users.status, "active"))),
      ),
  },
  verified_candidates: {
    key: "verified_candidates",
    label: STANDARD_PUBLIC_METRIC_LABELS.verified_candidates,
    definition: "Candidate profiles on which the Venkat Sai team has completed at least one verification step (identity, documents or skills).",
    compute: (tx) =>
      scalar(
        tx
          .select({ value: count() })
          .from(candidateProfiles)
          .innerJoin(users, eq(users.id, candidateProfiles.userId))
          .where(and(isNull(candidateProfiles.deletedAt), eq(users.status, "active"), ne(candidateProfiles.verificationLevel, "none"))),
      ),
  },
  active_employers: {
    key: "active_employers",
    label: STANDARD_PUBLIC_METRIC_LABELS.active_employers,
    definition: `Verified employers that published at least one job on Venkat Sai Global in the last ${ACTIVE_EMPLOYER_WINDOW_DAYS} days.`,
    compute: (tx, now) => {
      const since = new Date(now.getTime() - ACTIVE_EMPLOYER_WINDOW_DAYS * 24 * 3600 * 1000);
      return scalar(
        tx
          .select({ value: countDistinct(organizations.id) })
          .from(organizations)
          .innerJoin(jobs, eq(jobs.organizationId, organizations.id))
          .where(
            and(
              eq(organizations.type, "employer"),
              eq(organizations.status, "verified"),
              isNull(organizations.deletedAt),
              isNull(jobs.deletedAt),
              isNotNull(jobs.publishedAt),
              gte(jobs.publishedAt, since),
            ),
          ),
      );
    },
  },
  employer_partners: {
    key: "employer_partners",
    label: STANDARD_PUBLIC_METRIC_LABELS.employer_partners,
    definition: "Employer organisations registered on Venkat Sai Global whose details the Venkat Sai team has verified.",
    compute: (tx) => verifiedOrgs(tx, "employer"),
  },
  recruitment_partners: {
    key: "recruitment_partners",
    label: STANDARD_PUBLIC_METRIC_LABELS.recruitment_partners,
    definition: "Recruitment partner agencies registered on Venkat Sai Global whose details the Venkat Sai team has verified.",
    compute: (tx) => verifiedOrgs(tx, "recruitment_partner"),
  },
  training_partners: {
    key: "training_partners",
    label: STANDARD_PUBLIC_METRIC_LABELS.training_partners,
    definition: "Training institutions registered on Venkat Sai Global whose details the Venkat Sai team has verified.",
    compute: (tx) => verifiedOrgs(tx, "institution"),
  },
  jobs_facilitated: {
    key: "jobs_facilitated",
    label: STANDARD_PUBLIC_METRIC_LABELS.jobs_facilitated,
    definition: "Job listings that have been published on Venkat Sai Global since the platform launched (removed listings excluded).",
    compute: (tx) => scalar(tx.select({ value: count() }).from(jobs).where(and(isNotNull(jobs.publishedAt), isNull(jobs.deletedAt)))),
  },
  successful_placements: {
    key: "successful_placements",
    label: STANDARD_PUBLIC_METRIC_LABELS.successful_placements,
    definition: "Placements recorded on Venkat Sai Global in which the candidate joined the employer.",
    compute: (tx) => scalar(tx.select({ value: count() }).from(placements).where(inArray(placements.status, ["joined", "completed"]))),
  },
  active_countries: {
    key: "active_countries",
    label: STANDARD_PUBLIC_METRIC_LABELS.active_countries,
    definition: "Countries with a job currently published on Venkat Sai Global, or where a candidate placed through the platform joined.",
    compute: async (tx) => {
      const result = await tx.execute<{ value: string | number }>(sql`
        select count(*) as value from (
          select country_code from jobs where status = 'published' and deleted_at is null and country_code is not null
          union
          select country_code from placements where status in ('joined', 'completed') and country_code is not null
        ) as c`);
      return Number(result.rows[0]?.value ?? 0);
    },
  },
  training_programmes: {
    key: "training_programmes",
    label: STANDARD_PUBLIC_METRIC_LABELS.training_programmes,
    definition: "Training courses currently published on Venkat Sai Global.",
    compute: (tx) => scalar(tx.select({ value: count() }).from(courses).where(and(eq(courses.status, "published"), isNull(courses.deletedAt)))),
  },
  internship_opportunities: {
    key: "internship_opportunities",
    label: STANDARD_PUBLIC_METRIC_LABELS.internship_opportunities,
    definition: "Internship listings currently published on Venkat Sai Global.",
    compute: (tx) =>
      scalar(tx.select({ value: count() }).from(jobs).where(and(eq(jobs.status, "published"), isNull(jobs.deletedAt), eq(jobs.employmentType, "internship")))),
  },
};

const LIVE_KEYS: ReadonlySet<string> = new Set(STANDARD_PUBLIC_METRIC_VALUES);

function isStale(row: Pick<PublicMetricRow, "liveValue" | "liveValueComputedAt">, now: Date): boolean {
  return row.liveValue === null || !row.liveValueComputedAt || now.getTime() - row.liveValueComputedAt.getTime() > LIVE_METRIC_MAX_AGE_MINUTES * 60_000;
}

/** Compute one live counter now (no caching). Throws for unknown keys. */
export async function computeLiveMetric(key: string, now: Date = new Date(), tx: Tx = db): Promise<number> {
  const def = LIVE_METRICS[key as StandardPublicMetricKey];
  if (!def) throw new Error(`Unknown live metric: ${key}`);
  return def.compute(tx, now);
}

/** Recompute the cached value of the given rows' live counters (all rows with a live counter by default). */
export async function refreshLiveMetrics(now: Date = new Date(), opts: { keys?: string[]; onlyStale?: boolean } = {}): Promise<number> {
  const rows = await db.select().from(publicMetrics).where(isNotNull(publicMetrics.liveQueryKey));
  let refreshed = 0;
  for (const row of rows) {
    if (!row.liveQueryKey || !LIVE_KEYS.has(row.liveQueryKey)) continue;
    if (opts.keys && !opts.keys.includes(row.key)) continue;
    if (opts.onlyStale && !isStale(row, now)) continue;
    const value = await computeLiveMetric(row.liveQueryKey, now);
    await db.update(publicMetrics).set({ liveValue: value, liveValueComputedAt: now }).where(eq(publicMetrics.id, row.id));
    refreshed += 1;
  }
  return refreshed;
}

/**
 * Metrics the public site may show, in display order: visible live counters (cached up to
 * LIVE_METRIC_MAX_AGE_MINUTES) and approved manual figures with their as-of dates. Never anything else.
 */
export async function getPublicMetrics(opts: { now?: Date } = {}): Promise<PublicMetric[]> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select()
    .from(publicMetrics)
    .where(and(eq(publicMetrics.isVisible, true), ne(publicMetrics.mode, "hidden")))
    .orderBy(asc(publicMetrics.sortOrder), asc(publicMetrics.label));
  const out: PublicMetric[] = [];
  for (const row of rows) {
    let live: { value: number; computedAt: Date } | null = null;
    if (row.mode === "live" && row.liveQueryKey && LIVE_KEYS.has(row.liveQueryKey)) {
      if (isStale(row, now)) {
        const value = await computeLiveMetric(row.liveQueryKey, now);
        await db.update(publicMetrics).set({ liveValue: value, liveValueComputedAt: now }).where(eq(publicMetrics.id, row.id));
        live = { value, computedAt: now };
      } else {
        live = { value: row.liveValue!, computedAt: row.liveValueComputedAt! };
      }
    }
    const metric = displayableMetric(row, live, LIVE_KEYS);
    if (metric) out.push(metric);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Command Centre (metrics.public_manage)
// ---------------------------------------------------------------------------

async function lockMetric(key: string, tx: Tx): Promise<PublicMetricRow> {
  const locked = await tx.execute<{ id: string }>(sql`select id from public_metrics where key = ${key} for update`);
  if (!locked.rows.length) throw new ActionError("This metric could not be found.");
  const [row] = await tx.select().from(publicMetrics).where(eq(publicMetrics.key, key as PublicMetricKey)).limit(1);
  if (!row) throw new ActionError("This metric could not be found.");
  return row;
}

/** Every metric with its live value (computed when stale), manual figure, approval state and what is public now. */
export async function listMetricConfigs(ctx: StaffContext): Promise<AdminMetricItem[]> {
  assertStaff(ctx, "metrics.public_manage");
  const now = new Date();
  await refreshLiveMetrics(now, { onlyStale: true });
  const rows = await db
    .select({ metric: publicMetrics, approvedByName: users.displayName })
    .from(publicMetrics)
    .leftJoin(users, eq(users.id, publicMetrics.approvedByUserId))
    .orderBy(asc(publicMetrics.sortOrder), asc(publicMetrics.label));
  return rows.map(({ metric, approvedByName }) => {
    const live = metric.liveValue !== null && metric.liveValueComputedAt ? { value: metric.liveValue, computedAt: metric.liveValueComputedAt } : null;
    const shown = displayableMetric(metric, metric.mode === "live" ? live : null, LIVE_KEYS);
    return {
      key: metric.key,
      label: metric.label,
      mode: metric.mode,
      isVisible: metric.isVisible,
      definition: metric.definition,
      isStandard: LIVE_KEYS.has(metric.key),
      liveValue: metric.liveValue,
      liveValueComputedAt: metric.liveValueComputedAt,
      manualValue: metric.manualValue,
      asOfDate: metric.asOfDate,
      approvedValue: metric.approvedValue,
      approvedAsOfDate: metric.approvedAsOfDate,
      approvedAt: metric.approvedAt,
      approvedByName,
      manualApprovalCurrent: manualApprovalIsCurrent(metric),
      evidenceNote: metric.evidenceNote,
      evidenceFileId: metric.evidenceFileId,
      minDisplayValue: metric.minDisplayValue,
      sortOrder: metric.sortOrder,
      publicValue: shown?.value ?? null,
    };
  });
}

/**
 * Change a metric's label, definition, mode, visibility, threshold or order. Showing a metric needs a public
 * definition; a manual metric also needs a current approval; live mode only exists for standard counters.
 */
export async function updatePublicMetric(ctx: StaffContext, input: UpdateMetricInput): Promise<void> {
  assertStaff(ctx, "metrics.public_manage");
  try {
    await db.transaction(async (tx) => {
      const row = await lockMetric(input.key, tx);
      const definition = input.definition?.trim() || null;
      if (input.mode === "live" && (!row.liveQueryKey || !LIVE_KEYS.has(row.liveQueryKey))) {
        throw new ActionError("This metric has no live counter. Use a manual figure instead.", { fieldErrors: { mode: ["Not available for this metric"] } });
      }
      if (input.isVisible && input.mode !== "hidden") {
        if (!definition) throw new ActionError("Write a public definition before showing this metric.", { fieldErrors: { definition: ["Required to show the metric"] } });
        if (input.mode === "manual" && !manualApprovalIsCurrent(row)) {
          throw new ActionError("The manual figure must be approved (with evidence) before it can be shown.", { fieldErrors: { isVisible: ["Approve the figure first"] } });
        }
      }
      if (input.mode === "manual" && (row.manualValue === null || row.asOfDate === null)) {
        throw new ActionError("Enter the manual figure and its as-of date first.", { fieldErrors: { mode: ["Enter a figure first"] } });
      }
      await tx
        .update(publicMetrics)
        .set({
          label: input.label,
          definition,
          mode: input.mode,
          isVisible: input.isVisible,
          minDisplayValue: input.minDisplayValue ?? null,
          sortOrder: input.sortOrder,
          updatedByUserId: ctx.user.id,
        })
        .where(eq(publicMetrics.id, row.id));
      await audit({
        action: "metrics.config_updated",
        entityType: "public_metric",
        entityId: row.id,
        actorUserId: ctx.user.id,
        metadata: { key: row.key, from: { mode: row.mode, isVisible: row.isVisible }, to: { mode: input.mode, isVisible: input.isVisible } },
        tx,
      });
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/**
 * Enter (or correct) a manual figure with its as-of date and evidence. Any change to the value or date clears the
 * approval snapshot and hides the metric until it is approved again.
 */
export async function setManualMetricValue(ctx: StaffContext, input: ManualMetricValueInput): Promise<{ needsApproval: boolean; hidden: boolean }> {
  assertStaff(ctx, "metrics.public_manage");
  if (input.asOfDate > new Date().toISOString().slice(0, 10)) {
    throw new ActionError("The as-of date cannot be in the future.", { fieldErrors: { asOfDate: ["Choose today or an earlier date"] } });
  }
  try {
    return await db.transaction(async (tx) => {
      const row = await lockMetric(input.key, tx);
      const evidenceFileId = input.evidenceFileId !== undefined ? await prepareEvidenceFile(input.evidenceFileId, ctx.user.id, tx) : row.evidenceFileId;
      const evidenceNote = input.evidenceNote ?? row.evidenceNote;
      if (!evidenceFileId && !evidenceNote?.trim()) {
        throw new ActionError("Record how this figure was verified (a note or an evidence file).", { fieldErrors: { evidenceNote: ["Evidence is required"] } });
      }
      const changed = row.manualValue !== input.manualValue || row.asOfDate !== input.asOfDate || row.evidenceFileId !== evidenceFileId || row.evidenceNote !== evidenceNote;
      const keepApproval = !changed && row.approvedAt !== null;
      const hide = !keepApproval && row.mode === "manual" && row.isVisible;
      await tx
        .update(publicMetrics)
        .set({
          manualValue: input.manualValue,
          asOfDate: input.asOfDate,
          evidenceNote,
          evidenceFileId,
          ...(keepApproval ? {} : { approvedValue: null, approvedAsOfDate: null, approvedAt: null, approvedByUserId: null }),
          ...(hide ? { isVisible: false } : {}),
          updatedByUserId: ctx.user.id,
        })
        .where(eq(publicMetrics.id, row.id));
      await audit({
        action: "metrics.manual_value_set",
        entityType: "public_metric",
        entityId: row.id,
        actorUserId: ctx.user.id,
        metadata: { key: row.key, value: input.manualValue, asOfDate: input.asOfDate, approvalCleared: !keepApproval, hidden: hide },
        tx,
      });
      return { needsApproval: !keepApproval, hidden: hide };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Approve the current manual figure (snapshot of value + as-of date). Evidence must be recorded. */
export async function approveManualMetricValue(ctx: StaffContext, key: string): Promise<void> {
  assertStaff(ctx, "metrics.public_manage");
  try {
    await db.transaction(async (tx) => {
      const row = await lockMetric(key, tx);
      if (row.manualValue === null || row.asOfDate === null) throw new ActionError("There is no manual figure to approve.");
      if (!row.evidenceFileId && !row.evidenceNote?.trim()) throw new ActionError("Record the evidence for this figure before approving it.");
      await tx
        .update(publicMetrics)
        .set({ approvedValue: row.manualValue, approvedAsOfDate: row.asOfDate, approvedAt: new Date(), approvedByUserId: ctx.user.id })
        .where(eq(publicMetrics.id, row.id));
      await audit({
        action: "metrics.manual_value_approved",
        entityType: "public_metric",
        entityId: row.id,
        actorUserId: ctx.user.id,
        metadata: { key: row.key, value: row.manualValue, asOfDate: row.asOfDate },
        tx,
      });
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Add a custom metric (manual figures only; created hidden). */
export async function createCustomMetric(ctx: StaffContext, input: CustomMetricInput): Promise<{ id: string }> {
  assertStaff(ctx, "metrics.public_manage");
  try {
    const maxOrder = await db.select({ value: sql<number>`coalesce(max(${publicMetrics.sortOrder}), 0)::int` }).from(publicMetrics);
    const [row] = await db
      .insert(publicMetrics)
      .values({ key: input.key as PublicMetricKey, label: input.label, definition: input.definition ?? null, mode: "hidden", isVisible: false, sortOrder: Number(maxOrder[0]?.value ?? 0) + 10, updatedByUserId: ctx.user.id })
      .returning({ id: publicMetrics.id });
    await audit({ action: "metrics.custom_created", entityType: "public_metric", entityId: row!.id, actorUserId: ctx.user.id, metadata: { key: input.key } });
    return { id: row!.id };
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Delete a custom metric (standard metrics can only be hidden). */
export async function deleteCustomMetric(ctx: StaffContext, key: string): Promise<void> {
  assertStaff(ctx, "metrics.public_manage");
  if (LIVE_KEYS.has(key)) throw new ActionError("Standard metrics cannot be deleted. Hide them instead.");
  const [row] = await db.delete(publicMetrics).where(eq(publicMetrics.key, key as PublicMetricKey)).returning({ id: publicMetrics.id });
  if (!row) throw new ActionError("This metric could not be found.");
  await audit({ action: "metrics.custom_deleted", entityType: "public_metric", entityId: row.id, actorUserId: ctx.user.id, metadata: { key } });
}
