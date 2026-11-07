import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { planFeatures, type subscriptions } from "@/db/schema";

import { ENTITLEMENTS } from "./constants";
import { grantCredits } from "./credits";
import { addMonthsUtc, FEATURE_PERIOD_MONTHS, featureWindow } from "./periods";

type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * Grant the credit allowances of a subscription's plan for the current window (idempotent):
 *  - period "month" / "year": one grant per window anchored at the subscription start; `reset` grants expire at
 *    the window end, `rollover` grants stay until the subscription ends;
 *  - period "none": one grant for the whole subscription (closed when it ends).
 * Only credit-mode keys are granted (counted keys are measured from live data). Unlimited features need no grant.
 * Grants only while the subscription is trialing or active (a past-due subscription gets its allowance on payment).
 */
export async function syncSubscriptionAllowances(tx: DbOrTx, subscription: SubscriptionRow, now: Date = new Date()): Promise<number> {
  if (subscription.status !== "trialing" && subscription.status !== "active") return 0;
  if (subscription.startedAt.getTime() > now.getTime()) return 0;
  const features = await tx.select().from(planFeatures).where(eq(planFeatures.planId, subscription.planId));
  let granted = 0;
  for (const feature of features) {
    if (ENTITLEMENTS[feature.entitlementKey].mode !== "credit") continue;
    if (feature.limitValue === null || feature.limitValue <= 0) continue;
    let idempotencyKey: string;
    let expiresAt: Date | null = null;
    if (feature.period === "none") {
      idempotencyKey = `grant:${subscription.id}:${feature.entitlementKey}:once`;
    } else {
      const window = featureWindow(subscription.startedAt, feature.period, now);
      idempotencyKey = `grant:${subscription.id}:${feature.entitlementKey}:${window.start.toISOString()}`;
      expiresAt = feature.resetPolicy === "reset" ? window.end : null;
      // A window that extends past a fixed subscription end still expires at the window end; the remainder is
      // closed when the subscription ends (expireSubscriptionCredits).
    }
    const result = await grantCredits(
      {
        organizationId: subscription.organizationId,
        entitlementKey: feature.entitlementKey,
        delta: feature.limitValue,
        reason: "plan_grant",
        referenceType: "subscription",
        referenceId: subscription.id,
        idempotencyKey,
        expiresAt,
        note: null,
      },
      tx,
    );
    if (!result.duplicate) granted += feature.limitValue;
  }
  return granted;
}

/** Expiry of credits bought in a pack, from the feature period of the add-on plan (none = no expiry). */
export function packExpiry(period: "none" | "month" | "year", paidAt: Date): Date | null {
  return period === "none" ? null : addMonthsUtc(paidAt, FEATURE_PERIOD_MONTHS[period]);
}
