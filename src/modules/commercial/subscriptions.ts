import "server-only";

import { and, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { invoices, organizations, planPrices, plans, subscriptions, type SubscriptionStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { audit } from "@/modules/audit";
import { submitForApproval } from "@/modules/approvals/service";
import type { StaffContext } from "@/modules/identity/authz";
import { isFeatureEnabled } from "@/modules/settings";

import { assertStaff, authorizeOrgBilling, isOrgActor, type BillingActor } from "./access";
import { syncSubscriptionAllowances } from "./allowances";
import { getCommercialConfig } from "./config";
import { ADMIN_COMMERCIAL_PATHS, BILLING_PATHS, PORTAL_BILLING_PATH, RENEWAL_INVOICE_LEAD_DAYS, RENEWAL_REMINDER_DAYS } from "./constants";
import { couponForRenewal, validateCoupon, type CouponRow } from "./coupons";
import { expireDueCredits, expireSubscriptionCredits } from "./credits";
import { invalidState, isUniqueViolation, notFound, rethrowConstraint } from "./errors";
import { createAndIssueInvoice, voidInvoiceTx, type InvoiceRow } from "./invoices";
import { notifyBillingContacts } from "./notify";
import { addDays, billingPeriodEnd, isoDate } from "./periods";
import type { ChangePlanInput, StartSubscriptionInput, SubscriptionExceptionInput } from "./schemas";

/**
 * Subscriptions (README → Subscription lifecycle).
 *
 *   pending ──(first invoice paid)──► active ──(period end, renewal paid)──► active …
 *   trialing ──(trial end: renewal paid or free)──► active        └─(renewal unpaid)──► past_due ──(grace)──► expired
 *   any live ──(cancel at period end)──► cancelled at the period end;  staff may cancel immediately.
 *
 * Billing is invoice-based for every provider: renewal invoices are issued RENEWAL_INVOICE_LEAD_DAYS before the
 * period end and fall due on the period end; they can be paid offline or online. Plan changes take effect
 * immediately when the new plan's first invoice is paid (or at once when it costs nothing): the old subscription
 * ends at that moment with NO automatic proration — unused value is not credited unless finance agrees an
 * exception (subscription_exception approval) or a refund.
 */

export type SubscriptionRow = typeof subscriptions.$inferSelect;
type PlanRow = typeof plans.$inferSelect;
type PlanPriceRow = typeof planPrices.$inferSelect;

export const LIVE_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due", "paused"];

async function lockSubscription(tx: DbOrTx, subscriptionId: string): Promise<SubscriptionRow> {
  const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1).for("update");
  if (!row) throw notFound("Subscription");
  return row;
}

async function planWithPrice(tx: DbOrTx, planId: string, planPriceId: string | undefined): Promise<{ plan: PlanRow; price: PlanPriceRow | null }> {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw notFound("Plan");
  if (!planPriceId) return { plan, price: null };
  const [price] = await tx.select().from(planPrices).where(and(eq(planPrices.id, planPriceId), eq(planPrices.planId, plan.id))).limit(1);
  if (!price) throw notFound("Price");
  return { plan, price };
}

function planLabel(plan: Pick<PlanRow, "name">): string {
  return plan.name;
}

function subscriptionLink(organizationType: keyof typeof PORTAL_BILLING_PATH): string {
  return PORTAL_BILLING_PATH[organizationType];
}

async function orgType(tx: DbOrTx, organizationId: string): Promise<keyof typeof PORTAL_BILLING_PATH> {
  const [org] = await tx.select({ type: organizations.type }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw notFound("Organisation");
  return org.type;
}

async function notifyChange(tx: DbOrTx, subscription: SubscriptionRow, change: string, planName: string, extra: Record<string, unknown> = {}): Promise<void> {
  const type = await orgType(tx, subscription.organizationId);
  await notifyBillingContacts(tx, {
    event: "billing.subscription_changed",
    organizationId: subscription.organizationId,
    data: { planName, change, status: subscription.status, periodEnd: subscription.currentPeriodEnd ? isoDate(subscription.currentPeriodEnd) : null, ...extra },
    link: subscriptionLink(type),
    dedupeKey: `subscription-${change}:${subscription.id}:${subscription.updatedAt.getTime()}`,
  });
}

/** Cancel pending (unpaid) base subscriptions of an organisation and void their first invoices. */
async function cancelPendingBase(tx: DbOrTx, organizationId: string, actorUserId: string | null, reason: string, exceptId?: string): Promise<void> {
  const pending = await tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.kind, "base"), eq(subscriptions.status, "pending"), exceptId ? ne(subscriptions.id, exceptId) : undefined))
    .for("update");
  for (const sub of pending) {
    const open = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.subscriptionId, sub.id), inArray(invoices.status, ["issued", "overdue"]), eq(invoices.amountPaidMinor, 0)));
    for (const inv of open) await voidInvoiceTx(tx, inv.id, reason, actorUserId);
    await tx.update(subscriptions).set({ status: "cancelled", cancelledAt: new Date(), endedAt: new Date(), cancellationReason: reason }).where(eq(subscriptions.id, sub.id));
  }
}

/** End a live subscription now (plan change, staff cancellation, expiry): closes its allowance lots. */
async function endSubscriptionTx(tx: DbOrTx, subscription: SubscriptionRow, status: "cancelled" | "expired", reason: string | null, at: Date): Promise<SubscriptionRow> {
  const [row] = await tx
    .update(subscriptions)
    .set({ status, endedAt: at, cancelledAt: status === "cancelled" ? (subscription.cancelledAt ?? at) : subscription.cancelledAt, cancellationReason: reason ?? subscription.cancellationReason })
    .where(eq(subscriptions.id, subscription.id))
    .returning();
  await expireSubscriptionCredits(tx, subscription.id, subscription.organizationId);
  return row!;
}

function priceLines(plan: PlanRow, price: Pick<PlanPriceRow, "id" | "amountMinor" | "taxInclusive" | "interval">, period: { start: Date; end: Date | null }) {
  const intervalLabel = price.interval === "one_time" ? "" : ` (${isoDate(period.start)} to ${period.end ? isoDate(new Date(period.end.getTime() - 1)) : "open"})`;
  return [
    {
      description: `${plan.name} plan${intervalLabel}`,
      quantity: 1,
      unitAmountMinor: price.amountMinor,
      taxInclusive: price.taxInclusive,
      referenceType: price.interval === "one_time" ? "credit_pack" : "plan_price",
      referenceId: price.id,
    },
  ];
}

async function resolveCoupon(tx: DbOrTx, code: string | undefined, plan: PlanRow, currency: string, organizationId: string): Promise<CouponRow | null> {
  if (!code) return null;
  const validation = await validateCoupon({ code, currency, planId: plan.id, organizationId }, tx);
  if (!validation.ok) throw new ActionError(validation.reason, { fieldErrors: { couponCode: [validation.reason] } });
  return validation.coupon;
}

export type StartResult = { subscription: SubscriptionRow; invoice: InvoiceRow | null };

/**
 * Start a subscription for an organisation.
 *  - Members (billing manage) subscribe their own organisation to an active plan of their audience with an active
 *    recurring price; staff (commercial.invoices) may also start price-less contract subscriptions (manual).
 *  - Trial: when the plan has trialDays and the organisation never subscribed to the plan → trialing (no invoice
 *    until the renewal run). Free price → active. Otherwise → pending + first invoice (activated on payment).
 *  - Base plans: one live base plan per organisation (use changePlan); an older unpaid pending base subscription is
 *    cancelled and its invoice voided.
 */
export async function startSubscription(actor: BillingActor, input: StartSubscriptionInput): Promise<StartResult> {
  const organizationId = isOrgActor(actor) ? actor.organization.id : input.organizationId;
  if (!organizationId) throw new ActionError("Choose the organisation.", { fieldErrors: { organizationId: ["Required"] } });
  if (isOrgActor(actor) && !(await isFeatureEnabled("commercial.subscriptions", { organizationId }))) {
    throw new ActionError("Plans are not available for purchase at the moment. Please contact us.", { code: "feature_disabled" });
  }
  try {
    return await db.transaction(async (tx) => {
      const org = await authorizeOrgBilling(actor, organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
      // Serialise subscription changes per organisation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`subscription:${organizationId}`}, 0))`);
      const { plan, price } = await planWithPrice(tx, input.planId, input.planPriceId);
      if (!plan.isActive) throw invalidState("This plan is no longer available.");
      if (plan.audience !== org.type) throw invalidState("This plan is not available for your type of organisation.");
      if (isOrgActor(actor)) {
        if (plan.contactSalesOnly) throw invalidState("This plan is arranged with our team. Please contact us to subscribe.");
        if (!price) throw new ActionError("Choose a price.", { fieldErrors: { planPriceId: ["Required"] } });
      }
      if (price && !price.isActive) throw invalidState("This price is no longer available. Choose another price.");
      if (price?.interval === "one_time") throw invalidState("This is a one-time credit pack. Buy it as a credit pack instead.");

      if (plan.kind === "base") {
        const [live] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.kind, "base"), inArray(subscriptions.status, [...LIVE_STATUSES])))
          .limit(1);
        if (live) throw invalidState("Your organisation already has a plan. Change the plan instead of starting a new one.");
        await cancelPendingBase(tx, organizationId, actor.user.id, "Replaced by a newer plan selection");
      }

      const coupon = price ? await resolveCoupon(tx, input.couponCode, plan, price.currency, organizationId) : null;
      const now = new Date();
      const [previous] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.planId, plan.id)))
        .limit(1);
      const trial = plan.kind === "base" && plan.trialDays > 0 && !previous;
      const free = !price || price.amountMinor === 0;
      const periodEnd = trial ? addDays(now, plan.trialDays) : price ? billingPeriodEnd(now, price.interval) : null;
      const status: SubscriptionStatus = trial ? "trialing" : free ? "active" : "pending";

      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          organizationId,
          planId: plan.id,
          planPriceId: price?.id ?? null,
          kind: plan.kind,
          status,
          currency: price?.currency ?? null,
          amountMinor: price?.amountMinor ?? null,
          interval: price?.interval ?? null,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: trial ? periodEnd : null,
          autoRenew: input.autoRenew || isOrgActor(actor),
          provider: "manual",
          notes: isStaffActorNotes(actor, input.notes),
          createdByUserId: actor.user.id,
        })
        .returning();

      let invoice: InvoiceRow | null = null;
      if (status === "pending" && price) {
        invoice = await createAndIssueInvoice(tx, {
          organizationId,
          subscriptionId: subscription!.id,
          currency: price.currency,
          lines: priceLines(plan, price, { start: now, end: periodEnd }),
          coupon,
          servicePeriodStart: now,
          servicePeriodEnd: periodEnd,
          actorUserId: actor.user.id,
          now,
        });
        // A 100 % coupon makes the first invoice free: activate straight away.
        if (invoice.status === "paid") {
          const activated = await activatePendingSubscriptionTx(tx, subscription!.id, now, actor.user.id);
          await audit({ action: "commercial.subscription_started", entityType: "subscription", entityId: subscription!.id, organizationId, actorUserId: actor.user.id, metadata: { planId: plan.id, status: "active", invoiceId: invoice.id, couponId: coupon?.id ?? null }, tx });
          return { subscription: activated, invoice };
        }
      } else {
        await syncSubscriptionAllowances(tx, subscription!, now);
        await notifyChange(tx, subscription!, trial ? "trial_started" : "started", planLabel(plan));
      }
      await audit({
        action: "commercial.subscription_started",
        entityType: "subscription",
        entityId: subscription!.id,
        organizationId,
        actorUserId: actor.user.id,
        actorType: isOrgActor(actor) ? "user" : "staff",
        metadata: { planId: plan.id, planPriceId: price?.id ?? null, status, trialEndsAt: subscription!.trialEndsAt?.toISOString() ?? null, invoiceId: invoice?.id ?? null, couponId: coupon?.id ?? null },
        tx,
      });
      return { subscription: subscription!, invoice };
    });
  } catch (error) {
    if (isUniqueViolation(error, "subscriptions_live_base_uq")) throw invalidState("Your organisation already has a plan. Change the plan instead of starting a new one.");
    rethrowConstraint(error);
  }
}

function isStaffActorNotes(actor: BillingActor, notes: string | undefined): string | null {
  return isOrgActor(actor) ? null : (notes ?? null);
}

/**
 * Change the base plan (README → Plan changes). Creates the new subscription as pending with a full first-period
 * invoice; the switch happens when that invoice is paid (immediately for free plans or staff contract changes).
 * No proration: the remaining time of the old plan is not credited automatically.
 */
export async function changePlan(actor: BillingActor, input: ChangePlanInput): Promise<StartResult> {
  try {
    return await db.transaction(async (tx) => {
      const current = await lockSubscription(tx, input.subscriptionId);
      await authorizeOrgBilling(actor, current.organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`subscription:${current.organizationId}`}, 0))`);
      if (current.kind !== "base" || !LIVE_STATUSES.includes(current.status)) throw invalidState("Only the current plan can be changed.");
      if (current.planId === input.planId && current.planPriceId === (input.planPriceId ?? null)) throw invalidState("This is already your plan.");
      const type = await orgType(tx, current.organizationId);
      const { plan, price } = await planWithPrice(tx, input.planId, input.planPriceId);
      if (!plan.isActive || plan.kind !== "base" || plan.audience !== type) throw invalidState("This plan is not available for your organisation.");
      if (isOrgActor(actor) && (plan.contactSalesOnly || !price)) throw invalidState(plan.contactSalesOnly ? "This plan is arranged with our team. Please contact us." : "Choose a price.");
      if (price && (!price.isActive || price.interval === "one_time")) throw invalidState("This price is not available. Choose another price.");
      await cancelPendingBase(tx, current.organizationId, actor.user.id, "Replaced by a newer plan change");
      const coupon = price ? await resolveCoupon(tx, input.couponCode, plan, price.currency, current.organizationId) : null;
      const now = new Date();
      const periodEnd = price ? billingPeriodEnd(now, price.interval) : null;
      const free = !price || price.amountMinor === 0;
      const [next] = await tx
        .insert(subscriptions)
        .values({
          organizationId: current.organizationId,
          planId: plan.id,
          planPriceId: price?.id ?? null,
          kind: "base",
          status: "pending",
          currency: price?.currency ?? null,
          amountMinor: price?.amountMinor ?? null,
          interval: price?.interval ?? null,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenew: current.autoRenew,
          provider: "manual",
          createdByUserId: actor.user.id,
        })
        .returning();
      let invoice: InvoiceRow | null = null;
      if (!free && price) {
        invoice = await createAndIssueInvoice(tx, {
          organizationId: current.organizationId,
          subscriptionId: next!.id,
          currency: price.currency,
          lines: priceLines(plan, price, { start: now, end: periodEnd }),
          coupon,
          servicePeriodStart: now,
          servicePeriodEnd: periodEnd,
          notes: "Plan change: the new plan starts when this invoice is paid. The previous plan is not prorated.",
          actorUserId: actor.user.id,
          now,
        });
      }
      let result = next!;
      if (free || invoice?.status === "paid") result = await activatePendingSubscriptionTx(tx, next!.id, now, actor.user.id);
      await audit({
        action: "commercial.subscription_plan_change_requested",
        entityType: "subscription",
        entityId: current.id,
        organizationId: current.organizationId,
        actorUserId: actor.user.id,
        actorType: isOrgActor(actor) ? "user" : "staff",
        metadata: { fromPlanId: current.planId, toPlanId: plan.id, newSubscriptionId: next!.id, invoiceId: invoice?.id ?? null, immediate: result.status !== "pending" },
        tx,
      });
      return { subscription: result, invoice };
    });
  } catch (error) {
    rethrowConstraint(error);
  }
}

/**
 * Activate a pending subscription (its first invoice was paid, or it costs nothing). A pending BASE subscription
 * replaces the organisation's current base plan, which ends now (no proration).
 */
export async function activatePendingSubscriptionTx(tx: DbOrTx, subscriptionId: string, now: Date, actorUserId: string | null): Promise<SubscriptionRow> {
  const pending = await lockSubscription(tx, subscriptionId);
  if (pending.status !== "pending") return pending;
  const [plan] = await tx.select().from(plans).where(eq(plans.id, pending.planId)).limit(1);
  if (pending.kind === "base") {
    const live = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.organizationId, pending.organizationId), eq(subscriptions.kind, "base"), inArray(subscriptions.status, [...LIVE_STATUSES]), ne(subscriptions.id, pending.id)))
      .for("update");
    for (const old of live) {
      await endSubscriptionTx(tx, old, "cancelled", `Replaced by plan change to ${plan?.name ?? "a new plan"}`, now);
      // Renewal invoices of the old plan that nobody paid are no longer due.
      const open = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.subscriptionId, old.id), inArray(invoices.status, ["issued", "overdue"]), eq(invoices.amountPaidMinor, 0)));
      for (const inv of open) await voidInvoiceTx(tx, inv.id, "Plan changed before this period started", actorUserId);
    }
  }
  const [active] = await tx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, pending.id)).returning();
  await syncSubscriptionAllowances(tx, active!, now);
  await audit({ action: "commercial.subscription_activated", entityType: "subscription", entityId: pending.id, organizationId: pending.organizationId, actorUserId, actorType: actorUserId ? "user" : "system", metadata: { planId: pending.planId }, tx });
  await notifyChange(tx, active!, "activated", plan?.name ?? "Plan");
  return active!;
}

/** Called when an invoice tied to a subscription is fully paid (fulfilment). */
export async function onSubscriptionInvoicePaidTx(tx: DbOrTx, invoice: InvoiceRow, now: Date): Promise<void> {
  if (!invoice.subscriptionId) return;
  const sub = await lockSubscription(tx, invoice.subscriptionId);
  if (sub.status === "pending") {
    await activatePendingSubscriptionTx(tx, sub.id, now, null);
    return;
  }
  if (sub.status === "past_due" && invoice.servicePeriodStart && sub.currentPeriodStart && invoice.servicePeriodStart.getTime() === sub.currentPeriodStart.getTime()) {
    const [active] = await tx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, sub.id)).returning();
    await syncSubscriptionAllowances(tx, active!, now);
    await audit({ action: "commercial.subscription_reactivated", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorType: "system", actorUserId: null, metadata: { invoiceId: invoice.id }, tx });
  }
}

/**
 * Cancel. Members (and by default staff) cancel at the period end; staff may end immediately (open unpaid invoices
 * of the subscription are voided). A pending subscription is cancelled at once and its invoice voided.
 */
export async function cancelSubscription(actor: BillingActor, input: { subscriptionId: string; reason?: string; immediately?: boolean }): Promise<SubscriptionRow> {
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, input.subscriptionId);
    await authorizeOrgBilling(actor, sub.organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
    if (input.immediately && isOrgActor(actor)) throw new ActionError("Plans are cancelled at the end of the paid period. Contact us if you need to end it sooner.");
    const reason = input.reason?.trim() || null;
    const now = new Date();
    const [plan] = await tx.select({ name: plans.name }).from(plans).where(eq(plans.id, sub.planId)).limit(1);
    let row: SubscriptionRow;
    if (sub.status === "pending" || input.immediately) {
      if (!LIVE_STATUSES.includes(sub.status) && sub.status !== "pending") throw invalidState("This subscription has already ended.");
      const open = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.subscriptionId, sub.id), inArray(invoices.status, ["issued", "overdue"]), eq(invoices.amountPaidMinor, 0)));
      for (const inv of open) await voidInvoiceTx(tx, inv.id, "Subscription cancelled", actor.user.id);
      row = sub.status === "pending" ? (await tx.update(subscriptions).set({ status: "cancelled", cancelledAt: now, endedAt: now, cancellationReason: reason }).where(eq(subscriptions.id, sub.id)).returning())[0]! : await endSubscriptionTx(tx, sub, "cancelled", reason, now);
    } else {
      if (!LIVE_STATUSES.includes(sub.status)) throw invalidState("This subscription has already ended.");
      if (!sub.currentPeriodEnd) throw invalidState("This contract has no end date. Ask the Venkat Sai team to end it.");
      [row] = (await tx.update(subscriptions).set({ cancelAtPeriodEnd: true, cancelledAt: now, cancellationReason: reason }).where(eq(subscriptions.id, sub.id)).returning()) as [SubscriptionRow];
      // Renewal invoices for the period after the end are no longer due.
      const future = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.subscriptionId, sub.id), inArray(invoices.status, ["issued", "overdue"]), eq(invoices.amountPaidMinor, 0), gte(invoices.servicePeriodStart, sub.currentPeriodEnd)));
      for (const inv of future) await voidInvoiceTx(tx, inv.id, "Subscription set to end at the period end", actor.user.id);
    }
    await audit({
      action: input.immediately || sub.status === "pending" ? "commercial.subscription_cancelled" : "commercial.subscription_cancel_scheduled",
      entityType: "subscription",
      entityId: sub.id,
      organizationId: sub.organizationId,
      actorUserId: actor.user.id,
      actorType: isOrgActor(actor) ? "user" : "staff",
      metadata: { reason, effective: input.immediately || sub.status === "pending" ? now.toISOString() : sub.currentPeriodEnd?.toISOString() ?? null },
      tx,
    });
    await notifyChange(tx, row, input.immediately || sub.status === "pending" ? "cancelled" : "cancel_scheduled", plan?.name ?? "Plan");
    return row;
  });
}

/** Undo a scheduled cancellation before the period ends. */
export async function resumeSubscription(actor: BillingActor, subscriptionId: string): Promise<SubscriptionRow> {
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, subscriptionId);
    await authorizeOrgBilling(actor, sub.organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
    if (!sub.cancelAtPeriodEnd || !LIVE_STATUSES.includes(sub.status)) throw invalidState("This subscription is not set to end.");
    const [row] = await tx.update(subscriptions).set({ cancelAtPeriodEnd: false, cancelledAt: null, cancellationReason: null }).where(eq(subscriptions.id, sub.id)).returning();
    await audit({ action: "commercial.subscription_resumed", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorUserId: actor.user.id, actorType: isOrgActor(actor) ? "user" : "staff", tx });
    return row!;
  });
}

/** Turn automatic renewal invoices on or off. */
export async function setAutoRenew(actor: BillingActor, subscriptionId: string, autoRenew: boolean): Promise<SubscriptionRow> {
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, subscriptionId);
    await authorizeOrgBilling(actor, sub.organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
    if (!LIVE_STATUSES.includes(sub.status)) throw invalidState("This subscription has already ended.");
    const [row] = await tx.update(subscriptions).set({ autoRenew }).where(eq(subscriptions.id, sub.id)).returning();
    await audit({ action: "commercial.subscription_auto_renew", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorUserId: actor.user.id, metadata: { autoRenew }, tx });
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Exceptions (approval type subscription_exception)
// ---------------------------------------------------------------------------

/** Staff ask for an exception (extend a trial / period, reactivate an ended plan); decided in the approval centre. */
export async function requestSubscriptionException(ctx: StaffContext, input: SubscriptionExceptionInput): Promise<{ approvalId: string; code: string }> {
  assertStaff(ctx, ["commercial.invoices", "commercial.refunds"], "any");
  return db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, input.subscriptionId);
    const [plan] = await tx.select({ name: plans.name }).from(plans).where(eq(plans.id, sub.planId)).limit(1);
    if (input.kind === "extend_trial" && sub.status !== "trialing") throw invalidState("Only a trial can be extended as a trial.");
    if (input.kind === "extend_period" && (!LIVE_STATUSES.includes(sub.status) || !sub.currentPeriodEnd)) throw invalidState("Only a live subscription with an end date can be extended.");
    if (input.kind === "reactivate" && !["expired", "cancelled"].includes(sub.status)) throw invalidState("Only an ended subscription can be reactivated.");
    const labels = { extend_trial: "Extend trial", extend_period: "Extend period", reactivate: "Reactivate" } as const;
    const approval = await submitForApproval(
      {
        type: "subscription_exception",
        entityType: "subscription",
        entityId: sub.id,
        organizationId: sub.organizationId,
        title: `${labels[input.kind]} by ${input.days} days — ${plan?.name ?? "subscription"}`,
        summary: input.reason,
        payload: { kind: input.kind, days: input.days, reason: input.reason },
        submittedByUserId: ctx.user.id,
      },
      tx,
    );
    await audit({ action: "commercial.subscription_exception_requested", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { kind: input.kind, days: input.days, approvalId: approval.id }, tx });
    return { approvalId: approval.id, code: approval.code };
  });
}

/** Apply an approved exception (approval handler, inside the decision transaction). */
export async function applySubscriptionExceptionTx(tx: DbOrTx, subscriptionId: string, payload: { kind: string; days: number }, actorUserId: string): Promise<void> {
  const sub = await lockSubscription(tx, subscriptionId);
  const days = Math.max(1, Math.min(365, Math.round(payload.days)));
  const now = new Date();
  if (payload.kind === "extend_trial") {
    if (sub.status !== "trialing" || !sub.trialEndsAt || !sub.currentPeriodEnd) throw invalidState("The subscription is no longer in its trial.");
    await tx.update(subscriptions).set({ trialEndsAt: addDays(sub.trialEndsAt, days), currentPeriodEnd: addDays(sub.currentPeriodEnd, days), renewalReminderSentAt: null }).where(eq(subscriptions.id, sub.id));
    await voidFutureRenewalInvoices(tx, sub, actorUserId);
  } else if (payload.kind === "extend_period") {
    if (!LIVE_STATUSES.includes(sub.status) || !sub.currentPeriodEnd) throw invalidState("The subscription is no longer live.");
    await tx
      .update(subscriptions)
      .set({ currentPeriodEnd: addDays(sub.currentPeriodEnd, days), status: sub.status === "past_due" ? "active" : sub.status, renewalReminderSentAt: null })
      .where(eq(subscriptions.id, sub.id));
    await voidFutureRenewalInvoices(tx, sub, actorUserId);
  } else if (payload.kind === "reactivate") {
    if (!["expired", "cancelled"].includes(sub.status)) throw invalidState("The subscription is live again already.");
    const [row] = await tx
      .update(subscriptions)
      .set({ status: "active", currentPeriodStart: now, currentPeriodEnd: addDays(now, days), endedAt: null, cancelAtPeriodEnd: false, cancelledAt: null, cancellationReason: null, renewalReminderSentAt: null })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    await syncSubscriptionAllowances(tx, row!, now);
  } else {
    throw invalidState("Unknown exception type.");
  }
  await audit({ action: "commercial.subscription_exception_applied", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorUserId, actorType: "staff", metadata: { kind: payload.kind, days }, tx });
}

async function voidFutureRenewalInvoices(tx: DbOrTx, sub: SubscriptionRow, actorUserId: string | null): Promise<void> {
  if (!sub.currentPeriodEnd) return;
  const future = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.subscriptionId, sub.id), inArray(invoices.status, ["issued", "overdue"]), eq(invoices.amountPaidMinor, 0), gte(invoices.servicePeriodStart, sub.currentPeriodEnd)));
  for (const inv of future) await voidInvoiceTx(tx, inv.id, "Period changed by an approved exception; a new invoice will follow", actorUserId);
}

export function subscriptionAdminHref(subscriptionId: string): string {
  return ADMIN_COMMERCIAL_PATHS.subscription(subscriptionId);
}

// ---------------------------------------------------------------------------
// Renewals (task commercial.renewals)
// ---------------------------------------------------------------------------

export type RenewalSummary = {
  reminders: number;
  renewalInvoices: number;
  renewed: number;
  pastDue: number;
  expired: number;
  cancelled: number;
  pendingCancelled: number;
  creditsExpired: number;
  allowancesGranted: number;
  errors: number;
};

async function renewalInvoiceFor(tx: DbOrTx, sub: SubscriptionRow, periodStart: Date): Promise<InvoiceRow | null> {
  const [row] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.documentType, "invoice"), eq(invoices.servicePeriodStart, periodStart), ne(invoices.status, "void")))
    .limit(1);
  return row ?? null;
}

async function issueRenewalInvoice(tx: DbOrTx, sub: SubscriptionRow, plan: PlanRow): Promise<InvoiceRow | null> {
  if (!sub.currentPeriodEnd || !sub.interval || sub.interval === "one_time" || sub.amountMinor === null || !sub.currency) return null;
  if (sub.amountMinor === 0) return null;
  const start = sub.currentPeriodEnd;
  const existing = await renewalInvoiceFor(tx, sub, start);
  if (existing) return existing;
  const end = billingPeriodEnd(start, sub.interval);
  const [price] = sub.planPriceId ? await tx.select().from(planPrices).where(eq(planPrices.id, sub.planPriceId)).limit(1) : [];
  const coupon = await couponForRenewal(tx, sub.id);
  return createAndIssueInvoice(tx, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    currency: sub.currency,
    lines: priceLines(plan, { id: sub.planPriceId ?? sub.id, amountMinor: sub.amountMinor, taxInclusive: price?.taxInclusive ?? false, interval: sub.interval }, { start, end }),
    coupon,
    servicePeriodStart: start,
    servicePeriodEnd: end,
    dueAt: start,
    actorUserId: null,
  });
}

/** One subscription's renewal step (own transaction). Returns what happened. */
async function processOne(subscriptionId: string, now: Date, graceDays: number, summary: RenewalSummary): Promise<void> {
  await db.transaction(async (tx) => {
    const sub = await lockSubscription(tx, subscriptionId);
    const [plan] = await tx.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
    if (!plan) return;
    const type = await orgType(tx, sub.organizationId);

    if (sub.status === "pending") {
      const [first] = await tx.select().from(invoices).where(and(eq(invoices.subscriptionId, sub.id), eq(invoices.documentType, "invoice"))).limit(1);
      const deadline = first?.dueAt ? addDays(first.dueAt, graceDays) : addDays(sub.createdAt, graceDays);
      if (now.getTime() >= deadline.getTime() && (!first || first.amountPaidMinor === 0)) {
        if (first && ["issued", "overdue"].includes(first.status)) await voidInvoiceTx(tx, first.id, "Plan not activated: the first invoice was not paid in time", null);
        await tx.update(subscriptions).set({ status: "cancelled", cancelledAt: now, endedAt: now, cancellationReason: "First invoice not paid" }).where(eq(subscriptions.id, sub.id));
        await audit({ action: "commercial.subscription_pending_cancelled", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorType: "system", actorUserId: null, tx });
        summary.pendingCancelled += 1;
      }
      return;
    }
    if (!LIVE_STATUSES.includes(sub.status) || sub.status === "paused" || !sub.currentPeriodEnd) return;
    const end = sub.currentPeriodEnd;

    // 1. Reminders 7 and 1 days before the period end (each once per period: notify dedupe key).
    // Nearest reminder first, so a late run sends the 1-day reminder rather than a stale 7-day one.
    for (const days of [...RENEWAL_REMINDER_DAYS].sort((a, b) => a - b)) {
      const at = addDays(end, -days);
      if (now.getTime() >= at.getTime() && now.getTime() < end.getTime() && (!sub.renewalReminderSentAt || sub.renewalReminderSentAt.getTime() < at.getTime())) {
        await notifyBillingContacts(tx, {
          event: "billing.renewal_due",
          organizationId: sub.organizationId,
          data: { planName: plan.name, renewsOn: isoDate(end), daysLeft: days, endsAtPeriodEnd: sub.cancelAtPeriodEnd || !sub.autoRenew },
          link: subscriptionLink(type),
          dedupeKey: `renewal-due:${sub.id}:${isoDate(end)}:${days}`,
        });
        await tx.update(subscriptions).set({ renewalReminderSentAt: now }).where(eq(subscriptions.id, sub.id));
        summary.reminders += 1;
        break;
      }
    }

    // 2. Renewal invoice for the next period.
    if (sub.autoRenew && !sub.cancelAtPeriodEnd && now.getTime() >= addDays(end, -RENEWAL_INVOICE_LEAD_DAYS).getTime() && sub.status !== "past_due") {
      try {
        const before = await renewalInvoiceFor(tx, sub, end);
        const issued = await issueRenewalInvoice(tx, sub, plan);
        if (issued && !before) summary.renewalInvoices += 1;
      } catch (error) {
        if (error instanceof ActionError) {
          logger.warn("Renewal invoice not issued", { subscriptionId: sub.id, reason: error.message });
        } else throw error;
      }
    }

    // 3. Past due: expire after the grace period.
    if (sub.status === "past_due") {
      const due = await renewalInvoiceFor(tx, sub, sub.currentPeriodStart);
      if (due && due.amountPaidMinor >= due.totalMinor) {
        const [active] = await tx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, sub.id)).returning();
        await syncSubscriptionAllowances(tx, active!, now);
        summary.renewed += 1;
        return;
      }
      if (now.getTime() >= addDays(sub.currentPeriodStart, graceDays).getTime()) {
        if (due && ["issued", "overdue", "partially_paid"].includes(due.status) && due.amountPaidMinor === 0) await voidInvoiceTx(tx, due.id, "Subscription expired: renewal not paid within the grace period", null);
        const row = await endSubscriptionTx(tx, sub, "expired", "Renewal not paid", now);
        await audit({ action: "commercial.subscription_expired", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorType: "system", actorUserId: null, metadata: { reason: "unpaid" }, tx });
        await notifyBillingContacts(tx, { event: "billing.subscription_expired", organizationId: sub.organizationId, data: { planName: plan.name }, link: subscriptionLink(type), dedupeKey: `subscription-expired:${sub.id}:${isoDate(row.endedAt ?? now)}` });
        summary.expired += 1;
      }
      return;
    }

    // 4. Period end.
    if (now.getTime() < end.getTime()) return;
    if (sub.cancelAtPeriodEnd) {
      await endSubscriptionTx(tx, sub, "cancelled", sub.cancellationReason, end);
      await audit({ action: "commercial.subscription_cancelled", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorType: "system", actorUserId: null, metadata: { effective: end.toISOString() }, tx });
      await notifyBillingContacts(tx, { event: "billing.subscription_expired", organizationId: sub.organizationId, data: { planName: plan.name }, link: subscriptionLink(type), dedupeKey: `subscription-ended:${sub.id}:${isoDate(end)}` });
      summary.cancelled += 1;
      return;
    }
    const renews = sub.autoRenew || (sub.status === "trialing" && sub.amountMinor !== null);
    if (!renews) {
      await endSubscriptionTx(tx, sub, "expired", "Not renewed", end);
      await audit({ action: "commercial.subscription_expired", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorType: "system", actorUserId: null, metadata: { reason: "not_renewed" }, tx });
      await notifyBillingContacts(tx, { event: "billing.subscription_expired", organizationId: sub.organizationId, data: { planName: plan.name }, link: subscriptionLink(type), dedupeKey: `subscription-expired:${sub.id}:${isoDate(end)}` });
      summary.expired += 1;
      return;
    }
    const nextEnd = billingPeriodEnd(end, sub.interval);
    if (!nextEnd) {
      // No billing interval (contract without a price): ends unless renewed by staff.
      await endSubscriptionTx(tx, sub, "expired", "Contract period ended", end);
      summary.expired += 1;
      return;
    }
    const free = sub.amountMinor === 0;
    let invoice = free ? null : await renewalInvoiceFor(tx, sub, end);
    if (!free && !invoice) {
      try {
        invoice = await issueRenewalInvoice(tx, sub, plan);
        if (invoice) summary.renewalInvoices += 1;
      } catch (error) {
        if (!(error instanceof ActionError)) throw error;
        logger.warn("Renewal invoice not issued at period end", { subscriptionId: sub.id, reason: error.message });
      }
    }
    const paid = free || (invoice !== null && invoice.amountPaidMinor >= invoice.totalMinor);
    const [row] = await tx
      .update(subscriptions)
      .set({ status: paid ? "active" : "past_due", currentPeriodStart: end, currentPeriodEnd: nextEnd, renewalReminderSentAt: null, trialEndsAt: sub.trialEndsAt })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    if (paid) {
      summary.allowancesGranted += await syncSubscriptionAllowances(tx, row!, now);
      summary.renewed += 1;
    } else {
      summary.pastDue += 1;
      await notifyBillingContacts(tx, {
        event: "billing.payment_failed",
        organizationId: sub.organizationId,
        data: { invoiceCode: invoice?.code ?? null, reason: `The renewal of ${plan.name} is not paid yet. Pay within ${graceDays} days to keep the plan.` },
        link: invoice ? BILLING_PATHS.invoice(invoice.id) : subscriptionLink(type),
        dedupeKey: `renewal-unpaid:${sub.id}:${isoDate(end)}`,
      });
    }
    await audit({ action: paid ? "commercial.subscription_renewed" : "commercial.subscription_past_due", entityType: "subscription", entityId: sub.id, organizationId: sub.organizationId, actorType: "system", actorUserId: null, metadata: { periodStart: end.toISOString(), periodEnd: nextEnd.toISOString(), invoiceId: invoice?.id ?? null }, tx });
  });
}

/**
 * Daily renewal run: expire due credits, then for every pending / live subscription with a period end that needs
 * attention — reminders (7 and 1 days before), renewal invoices (7 days before), period changes, past-due expiry
 * after the grace period (commercial.grace_period_days, default 7) — and finally top up monthly / yearly
 * allowances of every live subscription. Idempotent: safe to run more than once a day.
 */
export async function processSubscriptionRenewals(now: Date = new Date()): Promise<RenewalSummary> {
  const summary: RenewalSummary = { reminders: 0, renewalInvoices: 0, renewed: 0, pastDue: 0, expired: 0, cancelled: 0, pendingCancelled: 0, creditsExpired: 0, allowancesGranted: 0, errors: 0 };
  const config = await getCommercialConfig();
  const graceDays = config["commercial.grace_period_days"];
  summary.creditsExpired = await expireDueCredits(now);

  const horizon = addDays(now, Math.max(...RENEWAL_REMINDER_DAYS, RENEWAL_INVOICE_LEAD_DAYS));
  const due = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      sql`(${subscriptions.status} = 'pending') or (${subscriptions.status} = 'past_due') or (${subscriptions.status} in ('trialing', 'active') and ${subscriptions.currentPeriodEnd} is not null and ${subscriptions.currentPeriodEnd} <= ${horizon})`,
    );
  for (const { id } of due) {
    try {
      await processOne(id, now, graceDays, summary);
    } catch (error) {
      summary.errors += 1;
      logger.error("Subscription renewal step failed", { error, subscriptionId: id });
    }
  }

  // Monthly allowances inside longer billing periods (and any grant missed earlier).
  const live = await db.select().from(subscriptions).where(and(inArray(subscriptions.status, ["trialing", "active"]), lte(subscriptions.startedAt, now)));
  for (const sub of live) {
    try {
      summary.allowancesGranted += await db.transaction((tx) => syncSubscriptionAllowances(tx, sub, now));
    } catch (error) {
      summary.errors += 1;
      logger.error("Allowance sync failed", { error, subscriptionId: sub.id });
    }
  }
  return summary;
}

/** Live subscriptions that renew within `days` (dashboards). */
export async function subscriptionsRenewingWithin(days: number, now: Date = new Date()): Promise<SubscriptionRow[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(inArray(subscriptions.status, ["trialing", "active", "past_due"]), isNotNull(subscriptions.currentPeriodEnd), lte(subscriptions.currentPeriodEnd, addDays(now, days))));
}
