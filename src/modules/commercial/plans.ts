import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { currencies, planFeatures, planPrices, plans } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { ENTITLEMENTS } from "./constants";
import type { EntitlementKey } from "./entitlements";
import { invalidState, notFound, rethrowConstraint } from "./errors";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import type { PlanFeatureFormInput, PlanFormInput, PlanPriceFormInput, PlanUpdateInput } from "./schemas";

/**
 * Plans, prices and plan features (Command Centre, permission commercial.plans). Nothing is seeded: Venkat Sai
 * defines every plan, price and limit. Price rows are immutable once created — change a price by deactivating it
 * and adding a new one (subscriptions keep their snapshotted amount).
 */

type PlanRow = typeof plans.$inferSelect;
type PlanPriceRow = typeof planPrices.$inferSelect;
type PlanFeatureRow = typeof planFeatures.$inferSelect;

function cleanHighlights(list: readonly string[]): string[] {
  return list.map((h) => h.trim()).filter(Boolean);
}

export async function createPlan(ctx: StaffContext, input: PlanFormInput): Promise<PlanRow> {
  assertStaff(ctx, "commercial.plans");
  try {
    return await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          audience: input.audience,
          kind: input.kind,
          isPublic: input.isPublic,
          isActive: input.isActive,
          contactSalesOnly: input.contactSalesOnly,
          sortOrder: input.sortOrder ?? 0,
          trialDays: input.kind === "base" ? (input.trialDays ?? 0) : 0,
          highlights: cleanHighlights(input.highlights),
        })
        .returning();
      await audit({ action: "commercial.plan_created", entityType: "plan", entityId: plan!.id, actorUserId: ctx.user.id, actorType: "staff", metadata: { key: plan!.key, audience: plan!.audience, kind: plan!.kind }, tx });
      return plan!;
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

export async function updatePlan(ctx: StaffContext, input: PlanUpdateInput): Promise<PlanRow> {
  assertStaff(ctx, "commercial.plans");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(plans).where(eq(plans.id, input.id)).limit(1).for("update");
    if (!existing) throw notFound("Plan");
    const [plan] = await tx
      .update(plans)
      .set({
        name: input.name,
        description: input.description ?? null,
        isPublic: input.isPublic,
        isActive: input.isActive,
        contactSalesOnly: input.contactSalesOnly,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        trialDays: existing.kind === "base" ? (input.trialDays ?? 0) : 0,
        highlights: cleanHighlights(input.highlights),
      })
      .where(eq(plans.id, input.id))
      .returning();
    await audit({
      action: "commercial.plan_updated",
      entityType: "plan",
      entityId: input.id,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { before: { name: existing.name, isPublic: existing.isPublic, isActive: existing.isActive, trialDays: existing.trialDays }, after: { name: plan!.name, isPublic: plan!.isPublic, isActive: plan!.isActive, trialDays: plan!.trialDays } },
      tx,
    });
    return plan!;
  });
}

/**
 * Make a base plan the default for its audience (applied to organisations without a subscription), or unset it.
 * At most one default per audience: the previous default is unset in the same transaction.
 */
export async function setDefaultPlan(ctx: StaffContext, planId: string, isDefault: boolean): Promise<void> {
  assertStaff(ctx, "commercial.plans");
  await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1).for("update");
    if (!plan) throw notFound("Plan");
    if (isDefault && plan.kind !== "base") throw invalidState("Only base plans can be the default plan.");
    if (isDefault) {
      await tx.update(plans).set({ isDefault: false }).where(and(eq(plans.audience, plan.audience), eq(plans.isDefault, true), ne(plans.id, planId)));
    }
    await tx.update(plans).set({ isDefault }).where(eq(plans.id, planId));
    await audit({ action: isDefault ? "commercial.plan_default_set" : "commercial.plan_default_unset", entityType: "plan", entityId: planId, actorUserId: ctx.user.id, actorType: "staff", metadata: { audience: plan.audience }, tx });
  });
}

export async function addPlanPrice(ctx: StaffContext, input: PlanPriceFormInput): Promise<PlanPriceRow> {
  assertStaff(ctx, "commercial.plans");
  try {
    return await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
      if (!plan) throw notFound("Plan");
      const [currency] = await tx.select().from(currencies).where(eq(currencies.code, input.currency)).limit(1);
      if (!currency || !currency.isActive) throw new ActionError("Choose an active currency.", { fieldErrors: { currency: ["Unknown or inactive currency"] } });
      if (input.interval === "one_time" && plan.kind !== "add_on") {
        throw new ActionError("One-time prices are for add-on plans (credit packs). Use a monthly, quarterly or yearly price for base plans.", { fieldErrors: { interval: ["Not allowed for base plans"] } });
      }
      if (input.interval === "one_time") {
        const features = await tx.select({ key: planFeatures.entitlementKey }).from(planFeatures).where(eq(planFeatures.planId, plan.id));
        const counted = features.filter((f) => ENTITLEMENTS[f.key].mode === "counted");
        if (counted.length) {
          throw new ActionError(`A one-time credit pack can only contain credit features. Remove ${counted.map((c) => ENTITLEMENTS[c.key].label).join(", ")} or sell it as a recurring add-on.`);
        }
      }
      const parsed = parseDecimalToMinor(input.amount, minorUnitsFor(currency.code, currency.minorUnits));
      if (!parsed.ok) throw new ActionError(parsed.error, { fieldErrors: { amount: [parsed.error] } });
      if (parsed.minor < 0) throw new ActionError("The price cannot be negative.", { fieldErrors: { amount: ["Negative"] } });
      const [price] = await tx
        .insert(planPrices)
        .values({ planId: plan.id, currency: currency.code, interval: input.interval, amountMinor: parsed.minor, taxInclusive: input.taxInclusive })
        .returning();
      await audit({
        action: "commercial.plan_price_added",
        entityType: "plan",
        entityId: plan.id,
        actorUserId: ctx.user.id,
        actorType: "staff",
        metadata: { priceId: price!.id, currency: price!.currency, interval: price!.interval, amountMinor: price!.amountMinor, taxInclusive: price!.taxInclusive },
        tx,
      });
      return price!;
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/** Deactivate a price (existing subscriptions keep their snapshot; new purchases cannot use it). */
export async function deactivatePlanPrice(ctx: StaffContext, priceId: string): Promise<void> {
  assertStaff(ctx, "commercial.plans");
  await db.transaction(async (tx) => {
    const [price] = await tx.update(planPrices).set({ isActive: false }).where(eq(planPrices.id, priceId)).returning();
    if (!price) throw notFound("Price");
    await audit({ action: "commercial.plan_price_deactivated", entityType: "plan", entityId: price.planId, actorUserId: ctx.user.id, actorType: "staff", metadata: { priceId }, tx });
  });
}

/** Store the gateway price / plan identifiers of a price (optional, for reconciliation). */
export async function setPlanPriceProviderIds(ctx: StaffContext, priceId: string, ids: { razorpay?: string | null; stripe?: string | null }): Promise<void> {
  assertStaff(ctx, "commercial.plans");
  const providerPriceIds = Object.fromEntries(Object.entries(ids).filter(([, v]) => typeof v === "string" && v.trim() !== "").map(([k, v]) => [k, (v as string).trim()]));
  const [row] = await db.update(planPrices).set({ providerPriceIds }).where(eq(planPrices.id, priceId)).returning({ planId: planPrices.planId });
  if (!row) throw notFound("Price");
  await audit({ action: "commercial.plan_price_provider_ids", entityType: "plan", entityId: row.planId, actorUserId: ctx.user.id, actorType: "staff", metadata: { priceId, providerPriceIds } });
}

/** Validate a feature definition against the entitlement's measuring mode (README → Entitlements). */
export function validateFeature(key: EntitlementKey, input: Pick<PlanFeatureFormInput, "period" | "resetPolicy">): string | null {
  const meta = ENTITLEMENTS[key];
  if (key === "team_seats" && input.period !== "none") return "Team seats are a standing limit: use the period “none”.";
  if (meta.mode === "counted" && input.resetPolicy === "rollover") return `${meta.label} are counted from live data, so unused allowance cannot roll over. Use “reset”.`;
  return null;
}

/** Add or replace the limit of one entitlement on a plan. */
export async function setPlanFeature(ctx: StaffContext, input: PlanFeatureFormInput): Promise<PlanFeatureRow> {
  assertStaff(ctx, "commercial.plans");
  const key = input.entitlementKey as EntitlementKey;
  const problem = validateFeature(key, input);
  if (problem) throw new ActionError(problem, { fieldErrors: { period: [problem] } });
  return db.transaction(async (tx) => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (!plan) throw notFound("Plan");
    if (ENTITLEMENTS[key].mode === "counted") {
      const [oneTime] = await tx.select({ id: planPrices.id }).from(planPrices).where(and(eq(planPrices.planId, plan.id), eq(planPrices.interval, "one_time"))).limit(1);
      if (oneTime) throw new ActionError(`This plan is sold as a one-time credit pack, which can only contain credit features. ${ENTITLEMENTS[key].label} need a recurring plan.`);
    }
    const values = { limitValue: input.unlimited ? null : (input.limitValue ?? 0), period: input.period, resetPolicy: input.resetPolicy };
    const [row] = await tx
      .insert(planFeatures)
      .values({ planId: plan.id, entitlementKey: key, ...values })
      .onConflictDoUpdate({ target: [planFeatures.planId, planFeatures.entitlementKey], set: { ...values, updatedAt: new Date() } })
      .returning();
    await audit({ action: "commercial.plan_feature_set", entityType: "plan", entityId: plan.id, actorUserId: ctx.user.id, actorType: "staff", metadata: { entitlementKey: key, ...values }, tx });
    return row!;
  });
}

export async function removePlanFeature(ctx: StaffContext, planId: string, entitlementKey: EntitlementKey): Promise<void> {
  assertStaff(ctx, "commercial.plans");
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(planFeatures).where(and(eq(planFeatures.planId, planId), eq(planFeatures.entitlementKey, entitlementKey))).returning({ id: planFeatures.id });
    if (!deleted.length) throw notFound("Plan feature");
    await audit({ action: "commercial.plan_feature_removed", entityType: "plan", entityId: planId, actorUserId: ctx.user.id, actorType: "staff", metadata: { entitlementKey }, tx });
  });
}
