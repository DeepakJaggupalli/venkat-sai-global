import "server-only";

import { and, count, eq, gt, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import {
  courses,
  jobPromotions,
  jobs,
  organizationMembers,
  organizations,
  partnerSubmissions,
  planFeatures,
  plans,
  requirementRequests,
  subscriptions,
  type PlanFeaturePeriod,
} from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { logger } from "@/lib/logger";
import { notifyOrganization } from "@/modules/notifications";

import { isEnforcingLimits } from "./config";
import { BILLING_VIEW_PERMISSION, CREDITS_LOW_RATIO, ENTITLEMENT_KEY_LIST, ENTITLEMENTS, PORTAL_BILLING_PATH } from "./constants";
import { appendLocked, consumedInWindow, ledgerHead, lockLedger } from "./credits";
import { EntitlementError } from "./entitlement-error";
import { aggregateFeature, evaluateCounted, evaluateCredit, lowCreditThreshold, type EffectiveFeature, type FeatureRow } from "./entitlement-rules";
import type { ConsumeOptions, EntitlementCheck, EntitlementKey } from "./entitlements";
import { calendarMonth, featureWindow, isoDate, type Window } from "./periods";

/**
 * Entitlements implementation (contract: ./entitlements.ts).
 *
 *  - Effective plan = every live subscription (trialing, active, past_due — paused grants nothing; base + add-ons)
 *    or, without a live base subscription, the default plan of the organisation's audience.
 *  - Counted keys (job_posts, featured_jobs, team_seats, courses, bulk_requirements, partner_submissions) compare a
 *    count of real data with the summed plan limit; credit keys (candidate_unlocks, candidate_search,
 *    analytics_reports) use the credit-ledger balance (README → Entitlements).
 *  - `commercial.enforce_limits` off: every check is allowed; consumption is still recorded for reporting.
 */

type LiveSubscription = {
  id: string;
  planId: string;
  planName: string;
  planKind: "base" | "add_on";
  status: string;
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
};

export type PlanContext = {
  organizationId: string;
  orgType: OrgType;
  subscriptions: LiveSubscription[];
  base: LiveSubscription | null;
  defaultPlan: { id: string; name: string } | null;
  features: (FeatureRow & { entitlementKey: EntitlementKey })[];
};

/** Subscription statuses whose plan features apply (paused and pending grant nothing). */
export const FEATURE_STATUSES = ["trialing", "active", "past_due"] as const;

/** Live subscriptions, the default plan when there is no live base plan, and their features. */
export async function loadPlanContext(organizationId: string, tx: DbOrTx = db): Promise<PlanContext | null> {
  const [org] = await tx.select({ id: organizations.id, type: organizations.type }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return null;
  const subs = await tx
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      planName: plans.name,
      planKind: subscriptions.kind,
      status: subscriptions.status,
      startedAt: subscriptions.startedAt,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.organizationId, organizationId), inArray(subscriptions.status, [...FEATURE_STATUSES])));
  const base = subs.find((s) => s.planKind === "base") ?? null;
  let defaultPlan: { id: string; name: string } | null = null;
  if (!base) {
    const [row] = await tx
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(and(eq(plans.audience, org.type), eq(plans.isDefault, true)))
      .limit(1);
    defaultPlan = row ?? null;
  }
  const planIds = [...new Set([...subs.map((s) => s.planId), ...(defaultPlan ? [defaultPlan.id] : [])])];
  const featureRows = planIds.length
    ? await tx
        .select({
          planId: planFeatures.planId,
          entitlementKey: planFeatures.entitlementKey,
          limitValue: planFeatures.limitValue,
          period: planFeatures.period,
          planName: plans.name,
          planKind: plans.kind,
        })
        .from(planFeatures)
        .innerJoin(plans, eq(plans.id, planFeatures.planId))
        .where(inArray(planFeatures.planId, planIds))
    : [];
  // A plan subscribed to twice (e.g. the same add-on bought twice) counts twice.
  const features: PlanContext["features"] = [];
  for (const row of featureRows) {
    const times = subs.filter((s) => s.planId === row.planId).length || (defaultPlan?.id === row.planId ? 1 : 0);
    for (let i = 0; i < times; i++) features.push({ ...row, isDefaultPlan: defaultPlan?.id === row.planId });
  }
  return { organizationId, orgType: org.type, subscriptions: subs, base, defaultPlan, features };
}

export function effectiveFeature(planCtx: PlanContext | null, key: EntitlementKey): EffectiveFeature {
  if (!planCtx) return aggregateFeature([]);
  const planNames = [...(planCtx.base ? [planCtx.base.planName] : []), ...(planCtx.defaultPlan ? [planCtx.defaultPlan.name] : []), ...planCtx.subscriptions.map((s) => s.planName)];
  return aggregateFeature(
    planCtx.features.filter((f) => f.entitlementKey === key),
    planNames,
  );
}

/** Counted standing caps are counted "now"; everything else inside a window. */
function isStanding(key: EntitlementKey, period: PlanFeaturePeriod): boolean {
  const meta = ENTITLEMENTS[key];
  if (key === "team_seats") return true;
  return meta.mode === "counted" && meta.standing && period === "none";
}

/** The usage window of a key: the feature period anchored at the subscription start, else the billing period. */
export function usageWindow(planCtx: PlanContext | null, period: PlanFeaturePeriod, now: Date): Window {
  const base = planCtx?.base ?? null;
  if (period !== "none") {
    if (base) return featureWindow(base.startedAt, period, now);
    return period === "month" ? calendarMonth(now) : { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)) };
  }
  if (base?.currentPeriodEnd && base.currentPeriodStart.getTime() <= now.getTime()) return { start: base.currentPeriodStart, end: base.currentPeriodEnd };
  return calendarMonth(now);
}

type ExcludeRef = { type: string; id: string } | null | undefined;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function excludeId(column: AnyColumn, exclude: ExcludeRef, type: string): SQL | undefined {
  if (!exclude || exclude.type !== type || !UUID_RE.test(exclude.id)) return undefined;
  return ne(column, exclude.id);
}

/** Count real usage for a counted key (excluding the referenced item, so a caller may insert it first). */
export async function countUsage(tx: DbOrTx, organizationId: string, key: EntitlementKey, window: Window | null, exclude?: ExcludeRef, now: Date = new Date()): Promise<number> {
  const first = (rows: { value: number }[]): number => rows[0]?.value ?? 0;
  switch (key) {
    case "job_posts":
      return first(
        await tx
          .select({ value: count() })
          .from(jobs)
          .where(
            and(
              eq(jobs.organizationId, organizationId),
              isNull(jobs.deletedAt),
              window
                ? and(gte(jobs.publishedAt, window.start), lt(jobs.publishedAt, window.end))
                : and(eq(jobs.status, "published"), or(isNull(jobs.expiresAt), gt(jobs.expiresAt, now))),
              excludeId(jobs.id, exclude, "job"),
            ),
          ),
      );
    case "featured_jobs":
      return first(
        await tx
          .select({ value: count() })
          .from(jobPromotions)
          .innerJoin(jobs, eq(jobs.id, jobPromotions.jobId))
          .where(
            and(
              eq(jobs.organizationId, organizationId),
              eq(jobPromotions.type, "featured"),
              isNull(jobPromotions.cancelledAt),
              window
                ? and(gte(jobPromotions.startsAt, window.start), lt(jobPromotions.startsAt, window.end))
                : and(lte(jobPromotions.startsAt, now), or(isNull(jobPromotions.endsAt), gt(jobPromotions.endsAt, now))),
              excludeId(jobPromotions.id, exclude, "job_promotion"),
            ),
          ),
      );
    case "team_seats":
      return first(
        await tx
          .select({ value: count() })
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.status, "active"), excludeId(organizationMembers.id, exclude, "organization_member"))),
      );
    case "courses":
      return first(
        await tx
          .select({ value: count() })
          .from(courses)
          .where(
            and(
              eq(courses.organizationId, organizationId),
              isNull(courses.deletedAt),
              window ? and(gte(courses.createdAt, window.start), lt(courses.createdAt, window.end)) : notInArray(courses.status, ["archived", "rejected"]),
              excludeId(courses.id, exclude, "course"),
            ),
          ),
      );
    case "bulk_requirements": {
      const w = window ?? calendarMonth(now);
      return first(
        await tx
          .select({ value: count() })
          .from(requirementRequests)
          .where(
            and(
              eq(requirementRequests.organizationId, organizationId),
              ne(requirementRequests.status, "draft"),
              gte(requirementRequests.createdAt, w.start),
              lt(requirementRequests.createdAt, w.end),
              excludeId(requirementRequests.id, exclude, "requirement_request"),
            ),
          ),
      );
    }
    case "partner_submissions": {
      const w = window ?? calendarMonth(now);
      return first(
        await tx
          .select({ value: count() })
          .from(partnerSubmissions)
          .where(
            and(
              eq(partnerSubmissions.partnerOrganizationId, organizationId),
              ne(partnerSubmissions.status, "withdrawn"),
              gte(partnerSubmissions.createdAt, w.start),
              lt(partnerSubmissions.createdAt, w.end),
              excludeId(partnerSubmissions.id, exclude, "partner_submission"),
            ),
          ),
      );
    }
    default:
      return 0;
  }
}

async function evaluate(
  tx: DbOrTx,
  planCtx: PlanContext | null,
  organizationId: string,
  key: EntitlementKey,
  opts: { enforce: boolean; quantity: number; exclude?: ExcludeRef; now: Date },
): Promise<{ check: EntitlementCheck; feature: EffectiveFeature; window: Window | null; balance: number | null }> {
  const feature = effectiveFeature(planCtx, key);
  const meta = ENTITLEMENTS[key];
  if (meta.mode === "counted") {
    const standing = isStanding(key, feature.period);
    const window = standing ? null : usageWindow(planCtx, feature.period, opts.now);
    const used = await countUsage(tx, organizationId, key, window, opts.exclude, opts.now);
    return { check: evaluateCounted({ key, enforce: opts.enforce, feature, used, quantity: opts.quantity, window }), feature, window, balance: null };
  }
  const window = usageWindow(planCtx, feature.period, opts.now);
  const { balance } = await ledgerHead(tx, organizationId, key);
  const usedInWindow = await consumedInWindow(organizationId, key, window.start, window.end, tx);
  return { check: evaluateCredit({ key, enforce: opts.enforce, feature, balance, usedInWindow, quantity: opts.quantity, window }), feature, window, balance };
}

/** Is the organisation allowed to use one more unit of `key`? (contract: ./entitlements.ts) */
export async function checkEntitlement(organizationId: string, key: EntitlementKey): Promise<EntitlementCheck> {
  const [enforce, planCtx] = await Promise.all([isEnforcingLimits(), loadPlanContext(organizationId)]);
  const { check } = await evaluate(db, planCtx, organizationId, key, { enforce, quantity: 1, now: new Date() });
  return check;
}

export function consumeIdempotencyKey(key: EntitlementKey, reference: { type: string; id: string }): string {
  return `consume:${key}:${reference.type}:${reference.id}`.slice(0, 300);
}

/**
 * Record usage of `key` (contract: ./entitlements.ts). Idempotent per (key, reference): consuming the same
 * reference twice records one entry — pass a distinct reference id for a deliberate repeat charge.
 * With enforcement on, the allowance is re-checked under the ledger lock and EntitlementError is thrown when
 * nothing is left; credit balances therefore never go below zero.
 */
export async function consumeEntitlement(organizationId: string, key: EntitlementKey, opts: ConsumeOptions): Promise<void> {
  const quantity = opts.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError("quantity must be a positive whole number");
  if (!opts.reference?.type || !opts.reference?.id) throw new RangeError("consumeEntitlement needs a reference { type, id }");
  const idempotencyKey = consumeIdempotencyKey(key, opts.reference);

  const run = async (tx: DbOrTx): Promise<void> => {
    await lockLedger(tx, organizationId, key);
    const already = await tx.execute<{ one: number }>(sql`select 1 as one from credit_ledger where organization_id = ${organizationId} and idempotency_key = ${idempotencyKey} limit 1`);
    if (already.rows.length) return;
    const now = new Date();
    const enforce = await isEnforcingLimits(tx);
    const planCtx = await loadPlanContext(organizationId, tx);
    if (!planCtx) throw new EntitlementError("Organisation not found.", key);
    let lowAlert: { threshold: number; before: number; windowEnd: Date | null } | null = null;
    if (enforce) {
      const { check, feature, window } = await evaluate(tx, planCtx, organizationId, key, { enforce, quantity, exclude: opts.reference, now });
      if (!check.allowed) throw new EntitlementError(check.reason ?? `No ${ENTITLEMENTS[key].unit} allowance left.`, key);
      if (ENTITLEMENTS[key].mode === "credit" && check.remaining !== null) {
        lowAlert = { threshold: lowCreditThreshold(feature.included ? feature.limit : null, CREDITS_LOW_RATIO), before: check.remaining, windowEnd: window?.end ?? null };
      }
    }
    const result = await appendLocked(tx, {
      organizationId,
      entitlementKey: key,
      delta: -quantity,
      reason: "consumption",
      referenceType: opts.reference.type,
      referenceId: opts.reference.id,
      idempotencyKey,
      actorUserId: opts.actorUserId ?? null,
    });
    if (!result.duplicate && lowAlert && lowAlert.before > lowAlert.threshold && result.balanceAfter <= lowAlert.threshold) {
      const windowLabel = lowAlert.windowEnd ? isoDate(lowAlert.windowEnd) : "open";
      await notifyOrganization(
        {
          event: "billing.credits_low",
          organizationId,
          permission: BILLING_VIEW_PERMISSION[planCtx.orgType],
          data: { remaining: Math.max(0, result.balanceAfter), creditName: ENTITLEMENTS[key].unit },
          link: PORTAL_BILLING_PATH[planCtx.orgType],
          dedupeKey: `credits-low:${organizationId}:${key}:${windowLabel}:${result.seq}`,
        },
        { tx },
      );
    }
  };

  if (opts.tx) return run(opts.tx);
  try {
    await db.transaction(run);
  } catch (error) {
    if (!(error instanceof EntitlementError)) logger.error("consumeEntitlement failed", { error, key });
    throw error;
  }
}

export type EntitlementUsage = EntitlementCheck & {
  key: EntitlementKey;
  label: string;
  mode: "counted" | "credit";
  included: boolean;
  period: PlanFeaturePeriod;
  /** Usage window (periodic keys); null for standing caps. */
  windowStart: Date | null;
  windowEnd: Date | null;
  /** Credit keys: current ledger balance (can be negative while limits are off). */
  balance: number | null;
};

/**
 * Usage vs limits for every key relevant to the organisation's type (billing pages). `enforced` tells the UI
 * whether limits currently block anything. No authorisation here — callers (queries.ts) authorise.
 */
export async function computeEntitlementSnapshot(organizationId: string, opts: { keys?: EntitlementKey[] } = {}): Promise<{ enforced: boolean; items: EntitlementUsage[] }> {
  const [enforce, planCtx] = await Promise.all([isEnforcingLimits(), loadPlanContext(organizationId)]);
  if (!planCtx) return { enforced: enforce, items: [] };
  const now = new Date();
  const keys = opts.keys ?? ENTITLEMENT_KEY_LIST.filter((k) => ENTITLEMENTS[k].audiences.includes(planCtx.orgType));
  const items: EntitlementUsage[] = [];
  for (const key of keys) {
    const { check, feature, window, balance } = await evaluate(db, planCtx, organizationId, key, { enforce, quantity: 1, now });
    items.push({
      ...check,
      key,
      label: ENTITLEMENTS[key].label,
      mode: ENTITLEMENTS[key].mode,
      included: feature.included,
      period: feature.period,
      windowStart: window?.start ?? null,
      windowEnd: window?.end ?? null,
      balance,
    });
  }
  return { enforced: enforce, items };
}
