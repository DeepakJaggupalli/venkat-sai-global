/**
 * Entitlement decisions (client-safe, pure). The database side (entitlements-impl.ts) loads the plan features
 * of the organisation's live subscriptions, the usage counts and the credit balance, then calls these.
 */
import type { PlanFeaturePeriod, PlanKind } from "@/db/schema/commercial";

import { ENTITLEMENTS } from "./constants";
import type { EntitlementCheck, EntitlementKey } from "./entitlements";
import { isoDate, type Window } from "./periods";

export type FeatureRow = {
  planId: string;
  planName: string;
  planKind: PlanKind;
  /** null = unlimited. */
  limitValue: number | null;
  period: PlanFeaturePeriod;
  /** The organisation has no subscription: the audience's default plan applies. */
  isDefaultPlan: boolean;
};

export type EffectiveFeature = {
  /** At least one live plan includes the key. */
  included: boolean;
  /** Sum of the plan limits; null = unlimited (any plan unlimited). */
  limit: number | null;
  /** Period of the base plan's feature (else the first add-on's); "none" when not included. */
  period: PlanFeaturePeriod;
  /** Name of the plan shown in upgrade prompts (base plan first). */
  planName: string | null;
  /** The organisation has some plan (subscription or default plan), even if it does not include the key. */
  hasPlan: boolean;
};

/** Combine the feature rows of every live plan (base + add-ons) for one key. */
export function aggregateFeature(rows: readonly FeatureRow[], planNames: readonly string[] = []): EffectiveFeature {
  const base = rows.find((r) => r.planKind === "base") ?? rows[0];
  const hasPlan = rows.length > 0 || planNames.length > 0;
  if (!rows.length) return { included: false, limit: 0, period: "none", planName: planNames[0] ?? null, hasPlan };
  const unlimited = rows.some((r) => r.limitValue === null);
  return {
    included: true,
    limit: unlimited ? null : rows.reduce((acc, r) => acc + (r.limitValue ?? 0), 0),
    period: base?.period ?? "none",
    planName: base?.planName ?? planNames[0] ?? null,
    hasPlan,
  };
}

function notIncludedReason(key: EntitlementKey, feature: EffectiveFeature): string {
  const meta = ENTITLEMENTS[key];
  const label = meta.label.toLowerCase();
  if (!feature.hasPlan) {
    return `Your organisation does not have an active plan that includes ${label}. Choose a plan to continue.`;
  }
  return meta.mode === "credit"
    ? `Your plan does not include ${label}. Upgrade your plan or buy a credit pack to continue.`
    : `Your plan does not include ${label}. Upgrade your plan to continue.`;
}

export type CountedInput = {
  key: EntitlementKey;
  enforce: boolean;
  feature: EffectiveFeature;
  /** Current usage counted from real data (excluding the item being added). */
  used: number;
  quantity?: number;
  /** Window for periodic counted keys (null for standing caps). */
  window: Window | null;
};

/** Counted entitlement (live counts vs the summed plan limit). */
export function evaluateCounted(input: CountedInput): EntitlementCheck {
  const { key, feature, used } = input;
  const quantity = input.quantity ?? 1;
  const meta = ENTITLEMENTS[key];
  const limit = feature.included ? feature.limit : 0;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const base = { enforced: input.enforce, limit, used, remaining, planName: feature.planName };
  if (!input.enforce) return { allowed: true, ...base };
  if (!feature.included) return { allowed: false, ...base, reason: notIncludedReason(key, feature) };
  if (limit === null || used + quantity <= limit) return { allowed: true, ...base };
  const reason = input.window
    ? `You have used all ${limit} ${limit === 1 ? meta.unit : meta.unitPlural} included in your plan for this period (it resets on ${isoDate(input.window.end)}). Upgrade your plan to continue.`
    : `Your plan includes ${limit} ${limit === 1 ? meta.unit : meta.unitPlural} and ${used} ${used === 1 ? "is" : "are"} in use. Upgrade your plan or free one up to continue.`;
  return { allowed: false, ...base, reason };
}

export type CreditInput = {
  key: EntitlementKey;
  enforce: boolean;
  feature: EffectiveFeature;
  /** Current ledger balance (may be negative while limits are not enforced). */
  balance: number;
  /** Consumption recorded in the current window (display). */
  usedInWindow: number;
  quantity?: number;
  window: Window | null;
};

/** Credit entitlement (ledger balance; unlimited features always allow). */
export function evaluateCredit(input: CreditInput): EntitlementCheck {
  const { key, feature, balance, usedInWindow } = input;
  const quantity = input.quantity ?? 1;
  const meta = ENTITLEMENTS[key];
  const unlimited = feature.included && feature.limit === null;
  const available = Math.max(0, balance);
  const base = unlimited
    ? { enforced: input.enforce, limit: null, used: usedInWindow, remaining: null, planName: feature.planName }
    : { enforced: input.enforce, limit: usedInWindow + available, used: usedInWindow, remaining: available, planName: feature.planName };
  if (!input.enforce || unlimited) return { allowed: true, ...base };
  if (available >= quantity) return { allowed: true, ...base };
  if (!feature.included && available <= 0) return { allowed: false, ...base, reason: notIncludedReason(key, feature) };
  const resets = feature.included && feature.period !== "none" && input.window ? ` Your allowance resets on ${isoDate(input.window.end)}.` : "";
  return {
    allowed: false,
    ...base,
    reason: `You have no ${meta.unit} credits left.${resets} Upgrade your plan or buy a credit pack to continue.`,
  };
}

/** Balance at or below which "credits running low" is sent for a window allowance. */
export function lowCreditThreshold(allowance: number | null, ratio: number): number {
  if (allowance === null || allowance <= 0) return 1;
  return Math.max(1, Math.floor(allowance * ratio));
}
