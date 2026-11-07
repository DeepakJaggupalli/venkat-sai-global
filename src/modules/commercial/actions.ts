"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { OrgPermissionFor } from "@/config/permissions";
import type { OrgType } from "@/db/schema/_constants";
import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff, type OrgContext } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";

import { BILLING_MANAGE_PERMISSION, BILLING_PATHS, BILLING_VIEW_PERMISSION, ENTITLEMENT_KEY_LIST, PARTNER_SETTLEMENTS_PATH, PORTAL_BILLING_PATH } from "./constants";
import type { EntitlementKey } from "./entitlements";
import {
  allocatePaymentSchema,
  applyCouponSchema,
  billingProfileFormSchema,
  cancelSubscriptionSchema,
  changePlanSchema,
  checkoutSchema,
  completeManualRefundSchema,
  couponFormSchema,
  creditAdjustmentSchema,
  disputeDecisionSchema,
  disputeOpenSchema,
  invoiceIdSchema,
  manualInvoiceSchema,
  offlinePaymentSchema,
  partnerInvoiceSchema,
  planFeatureFormSchema,
  planFormSchema,
  planPriceFormSchema,
  planUpdateSchema,
  purchaseCreditPackSchema,
  razorpayVerifySchema,
  refundRequestSchema,
  settlementComputeSchema,
  settlementDisputeSchema,
  settlementLineSchema,
  settlementPaidSchema,
  settlementUpdateSchema,
  startSubscriptionSchema,
  subscriptionExceptionSchema,
  subscriptionIdSchema,
  taxRateFormSchema,
  voidInvoiceSchema,
} from "./schemas";
import * as service from "./service";

/**
 * Server Actions for the commercial module. Portal actions take `portal` ("employer" | "recruiter" | "institution")
 * to resolve the member's organisation context; Command Centre actions require staff permissions. Services re-check
 * authorisation and scope.
 */

const ADMIN = "/admin/commercial";

const PORTALS = { employer: "employer", recruiter: "recruitment_partner", institution: "institution" } as const satisfies Record<string, OrgType>;
const portalField = z.enum(["employer", "recruiter", "institution"], { error: "Unknown portal" });

async function memberContext(portal: keyof typeof PORTALS, level: "view" | "manage"): Promise<OrgContext> {
  const orgType = PORTALS[portal];
  const permission = (level === "manage" ? BILLING_MANAGE_PERMISSION[orgType] : BILLING_VIEW_PERMISSION[orgType]) as OrgPermissionFor<typeof orgType>;
  return requireOrgMember(orgType, permission);
}

function revalidateBilling(orgType: OrgType | null, invoiceId?: string | null): void {
  if (orgType) revalidatePath(PORTAL_BILLING_PATH[orgType]);
  revalidatePath(ADMIN, "layout");
  if (invoiceId) revalidatePath(BILLING_PATHS.invoice(invoiceId));
}

// ---------------------------------------------------------------------------
// Plans, prices, features, coupons, tax rates (Command Centre)
// ---------------------------------------------------------------------------

export const createPlanAction = createFormAction(planFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  const plan = await service.createPlan(ctx, input);
  revalidatePath(`${ADMIN}/plans`);
  return ok({ id: plan.id }, "Plan created");
});

export const updatePlanAction = createFormAction(planUpdateSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  await service.updatePlan(ctx, input);
  revalidatePath(`${ADMIN}/plans`);
  return ok(undefined, "Plan saved");
});

export const setDefaultPlanAction = createAction(z.object({ planId: f.uuid(), isDefault: z.boolean() }), async ({ planId, isDefault }) => {
  const ctx = await requireStaff("commercial.plans");
  await service.setDefaultPlan(ctx, planId, isDefault);
  revalidatePath(`${ADMIN}/plans`);
  return ok(undefined, isDefault ? "Default plan set" : "Default plan removed");
});

export const addPlanPriceAction = createFormAction(planPriceFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  const price = await service.addPlanPrice(ctx, input);
  revalidatePath(`${ADMIN}/plans`);
  return ok({ id: price.id }, "Price added");
});

export const deactivatePlanPriceAction = createAction(z.object({ priceId: f.uuid() }), async ({ priceId }) => {
  const ctx = await requireStaff("commercial.plans");
  await service.deactivatePlanPrice(ctx, priceId);
  revalidatePath(`${ADMIN}/plans`);
  return ok(undefined, "Price deactivated");
});

export const setPlanFeatureAction = createFormAction(planFeatureFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  await service.setPlanFeature(ctx, input);
  revalidatePath(`${ADMIN}/plans`);
  return ok(undefined, "Limit saved");
});

export const removePlanFeatureAction = createAction(
  z.object({ planId: f.uuid(), entitlementKey: z.enum(ENTITLEMENT_KEY_LIST as unknown as [string, ...string[]]) }),
  async ({ planId, entitlementKey }) => {
    const ctx = await requireStaff("commercial.plans");
    await service.removePlanFeature(ctx, planId, entitlementKey as EntitlementKey);
    revalidatePath(`${ADMIN}/plans`);
    return ok(undefined, "Limit removed");
  },
);

export const saveCouponAction = createFormAction(couponFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  const coupon = await service.saveCoupon(ctx, input);
  revalidatePath(`${ADMIN}/coupons`);
  return ok({ id: coupon.id }, "Coupon saved");
});

export const setCouponActiveAction = createAction(z.object({ couponId: f.uuid(), isActive: z.boolean() }), async ({ couponId, isActive }) => {
  const ctx = await requireStaff("commercial.plans");
  await service.setCouponActive(ctx, couponId, isActive);
  revalidatePath(`${ADMIN}/coupons`);
  return ok(undefined, isActive ? "Coupon activated" : "Coupon deactivated");
});

export const saveTaxRateAction = createFormAction(taxRateFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  const row = await service.saveTaxRate(ctx, input);
  revalidatePath(`${ADMIN}/tax-rates`);
  return ok({ id: row.id }, "Tax rate saved");
});

export const confirmTaxRateAction = createAction(z.object({ taxRateId: f.uuid() }), async ({ taxRateId }) => {
  const ctx = await requireStaff("commercial.plans");
  await service.confirmTaxRate(ctx, taxRateId);
  revalidatePath(`${ADMIN}/tax-rates`);
  return ok(undefined, "Rate confirmed");
});

// ---------------------------------------------------------------------------
// Billing profiles
// ---------------------------------------------------------------------------

/** Members save their own organisation's billing details (`portal` hidden field). */
export const saveBillingProfileAction = createFormAction(billingProfileFormSchema.and(z.object({ portal: portalField })), async (input) => {
  const ctx = await memberContext(input.portal, "manage");
  await service.upsertBillingProfile(ctx, { ...input, organizationId: undefined });
  revalidateBilling(ctx.orgType);
  return ok(undefined, "Billing details saved");
});

export const saveBillingProfileForStaffAction = createFormAction(billingProfileFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.invoices");
  if (!input.organizationId) throw new ActionError("Choose the organisation.", { fieldErrors: { organizationId: ["Required"] } });
  await service.upsertBillingProfile(ctx, input);
  revalidateBilling(null);
  return ok(undefined, "Billing details saved");
});

// ---------------------------------------------------------------------------
// Invoices (Command Centre)
// ---------------------------------------------------------------------------

export const saveDraftInvoiceAction = createFormAction(manualInvoiceSchema, async (input) => {
  const ctx = await requireStaff("commercial.invoices");
  const invoice = await service.saveDraftInvoice(ctx, input);
  revalidatePath(`${ADMIN}/invoices`);
  return ok({ id: invoice.id }, "Draft saved");
});

export const deleteDraftInvoiceAction = createAction(invoiceIdSchema, async ({ invoiceId }) => {
  const ctx = await requireStaff("commercial.invoices");
  await service.deleteDraftInvoice(ctx, invoiceId);
  revalidatePath(`${ADMIN}/invoices`);
  return ok(undefined, "Draft deleted");
});

export const applyCouponToDraftAction = createAction(applyCouponSchema, async ({ invoiceId, code }) => {
  const ctx = await requireStaff("commercial.invoices");
  const result = await service.applyCouponToDraft(ctx, invoiceId, code);
  revalidatePath(`${ADMIN}/invoices`);
  return ok(result, "Coupon added");
});

export const removeCouponFromDraftAction = createAction(invoiceIdSchema, async ({ invoiceId }) => {
  const ctx = await requireStaff("commercial.invoices");
  await service.removeCouponFromDraft(ctx, invoiceId);
  revalidatePath(`${ADMIN}/invoices`);
  return ok(undefined, "Coupon removed");
});

export const issueInvoiceAction = createAction(invoiceIdSchema.extend({ dueDays: z.number().int().min(0).max(120).optional() }), async ({ invoiceId, dueDays }) => {
  const ctx = await requireStaff("commercial.invoices");
  const invoice = await service.issueInvoice(ctx, invoiceId, { dueDays });
  revalidateBilling(null, invoiceId);
  return ok({ id: invoice.id, code: invoice.code }, `Invoice ${invoice.code} issued`);
});

export const voidInvoiceAction = createFormAction(voidInvoiceSchema, async ({ invoiceId, reason }) => {
  const ctx = await requireStaff("commercial.invoices");
  await service.voidInvoice(ctx, invoiceId, reason);
  revalidateBilling(null, invoiceId);
  return ok(undefined, "Invoice voided");
});

// ---------------------------------------------------------------------------
// Payments, refunds, disputes
// ---------------------------------------------------------------------------

export const recordOfflinePaymentAction = createFormAction(offlinePaymentSchema, async (input) => {
  const ctx = await requireStaff("commercial.payments");
  const payment = await service.recordOfflinePayment(ctx, input);
  revalidateBilling(null, payment.invoiceId);
  return ok({ id: payment.id, code: payment.code }, `Payment ${payment.code} recorded`);
});

export const allocatePaymentAction = createAction(allocatePaymentSchema, async (input) => {
  const ctx = await requireStaff("commercial.payments");
  await service.allocatePayment(ctx, input);
  revalidateBilling(null, input.invoiceId);
  return ok(undefined, "Payment allocated");
});

export const requestRefundAction = createFormAction(refundRequestSchema, async (input) => {
  const ctx = await requireStaff(["commercial.payments", "commercial.refunds"], "any");
  const refund = await service.requestRefund(ctx, input);
  revalidatePath(`${ADMIN}/refunds`);
  return ok({ id: refund.id, code: refund.code }, `Refund ${refund.code} sent for approval`);
});

export const resubmitRefundAction = createFormAction(
  z.object({ refundId: f.uuid(), amount: z.string().trim().optional(), reason: f.optionalText(1000) }),
  async (input) => {
    const ctx = await requireStaff(["commercial.payments", "commercial.refunds"], "any");
    await service.resubmitRefund(ctx, input);
    revalidatePath(`${ADMIN}/refunds`);
    return ok(undefined, "Refund resubmitted for approval");
  },
);

export const completeManualRefundAction = createFormAction(completeManualRefundSchema, async (input) => {
  const ctx = await requireStaff("commercial.refunds");
  await service.completeManualRefund(ctx, input);
  revalidatePath(`${ADMIN}/refunds`);
  return ok(undefined, "Refund completed");
});

export const retryRefundAction = createAction(z.object({ refundId: f.uuid() }), async ({ refundId }) => {
  const ctx = await requireStaff("commercial.refunds");
  await service.retryRefund(ctx, refundId);
  revalidatePath(`${ADMIN}/refunds`);
  return ok(undefined, "Refund queued again");
});

export const openDisputeAction = createFormAction(disputeOpenSchema.and(z.object({ portal: portalField })), async (input) => {
  const ctx = await memberContext(input.portal, "view");
  await service.openDispute(ctx, input);
  revalidateBilling(ctx.orgType, input.invoiceId);
  return ok(undefined, "Your dispute has been sent to the Venkat Sai finance team");
});

export const openDisputeForStaffAction = createFormAction(disputeOpenSchema, async (input) => {
  const ctx = await requireStaff("commercial.refunds");
  const dispute = await service.openDispute(ctx, input);
  revalidatePath(`${ADMIN}/disputes`);
  return ok({ id: dispute.id }, "Dispute recorded");
});

export const updateDisputeAction = createFormAction(disputeDecisionSchema, async (input) => {
  const ctx = await requireStaff("commercial.refunds");
  await service.updateDispute(ctx, input);
  revalidatePath(`${ADMIN}/disputes`);
  return ok(undefined, "Dispute updated");
});

// ---------------------------------------------------------------------------
// Online checkout (members / individual buyers)
// ---------------------------------------------------------------------------

/** Start an online payment: Razorpay returns the checkout payload; Stripe returns the hosted checkout URL. */
export const startCheckoutAction = createAction(checkoutSchema, async (input) => {
  const user = await requireUser();
  const result = await service.startInvoiceCheckout(user, input);
  return ok(result);
});

export const verifyRazorpayPaymentAction = createAction(razorpayVerifySchema, async (input) => {
  const user = await requireUser();
  const outcome = await service.verifyRazorpayCheckout(user, input);
  if (outcome.invoiceId) revalidatePath(BILLING_PATHS.invoice(outcome.invoiceId));
  return ok(outcome, outcome.status === "recorded" || outcome.status === "duplicate" ? "Payment received" : "We are confirming your payment");
});

// ---------------------------------------------------------------------------
// Subscriptions & credits
// ---------------------------------------------------------------------------

export const startSubscriptionAction = createFormAction(startSubscriptionSchema.and(z.object({ portal: portalField })), async (input) => {
  const ctx = await memberContext(input.portal, "manage");
  const result = await service.startSubscription(ctx, { ...input, organizationId: undefined, notes: undefined });
  revalidateBilling(ctx.orgType, result.invoice?.id);
  return ok(
    { subscriptionId: result.subscription.id, status: result.subscription.status, invoiceId: result.invoice?.id ?? null },
    result.subscription.status === "pending" ? "Your plan starts as soon as the invoice is paid" : result.subscription.status === "trialing" ? "Your trial has started" : "Your plan is active",
  );
});

export const startSubscriptionForStaffAction = createFormAction(startSubscriptionSchema, async (input) => {
  const ctx = await requireStaff("commercial.invoices");
  const result = await service.startSubscription(ctx, input);
  revalidateBilling(null, result.invoice?.id);
  return ok({ subscriptionId: result.subscription.id, status: result.subscription.status, invoiceId: result.invoice?.id ?? null }, "Subscription created");
});

export const changePlanAction = createFormAction(changePlanSchema.and(z.object({ portal: portalField })), async (input) => {
  const ctx = await memberContext(input.portal, "manage");
  const result = await service.changePlan(ctx, input);
  revalidateBilling(ctx.orgType, result.invoice?.id);
  return ok({ subscriptionId: result.subscription.id, status: result.subscription.status, invoiceId: result.invoice?.id ?? null }, result.subscription.status === "pending" ? "Your new plan starts when the invoice is paid" : "Your plan has changed");
});

export const changePlanForStaffAction = createFormAction(changePlanSchema, async (input) => {
  const ctx = await requireStaff("commercial.invoices");
  const result = await service.changePlan(ctx, input);
  revalidateBilling(null, result.invoice?.id);
  return ok({ subscriptionId: result.subscription.id, status: result.subscription.status, invoiceId: result.invoice?.id ?? null }, "Plan change recorded");
});

export const cancelSubscriptionAction = createFormAction(cancelSubscriptionSchema.and(z.object({ portal: portalField.optional() })), async (input) => {
  const ctx = input.portal ? await memberContext(input.portal, "manage") : await requireStaff("commercial.invoices");
  const row = await service.cancelSubscription(ctx, input);
  revalidateBilling(input.portal ? PORTALS[input.portal] : null);
  return ok({ status: row.status }, row.status === "cancelled" ? "Subscription cancelled" : "Your plan will end at the end of the current period");
});

export const resumeSubscriptionAction = createAction(subscriptionIdSchema.extend({ portal: portalField.optional() }), async (input) => {
  const ctx = input.portal ? await memberContext(input.portal, "manage") : await requireStaff("commercial.invoices");
  await service.resumeSubscription(ctx, input.subscriptionId);
  revalidateBilling(input.portal ? PORTALS[input.portal] : null);
  return ok(undefined, "Your plan will continue");
});

export const setAutoRenewAction = createAction(subscriptionIdSchema.extend({ autoRenew: z.boolean(), portal: portalField.optional() }), async (input) => {
  const ctx = input.portal ? await memberContext(input.portal, "manage") : await requireStaff("commercial.invoices");
  await service.setAutoRenew(ctx, input.subscriptionId, input.autoRenew);
  revalidateBilling(input.portal ? PORTALS[input.portal] : null);
  return ok(undefined, input.autoRenew ? "Automatic renewal is on" : "Automatic renewal is off");
});

export const requestSubscriptionExceptionAction = createFormAction(subscriptionExceptionSchema, async (input) => {
  const ctx = await requireStaff(["commercial.invoices", "commercial.refunds"], "any");
  const result = await service.requestSubscriptionException(ctx, input);
  revalidatePath(`${ADMIN}/subscriptions`);
  return ok(result, `Exception ${result.code} sent for approval`);
});

export const purchaseCreditPackAction = createFormAction(purchaseCreditPackSchema.and(z.object({ portal: portalField })), async (input) => {
  const ctx = await memberContext(input.portal, "manage");
  const invoice = await service.purchaseCreditPack(ctx, input);
  revalidateBilling(ctx.orgType, invoice.id);
  return ok({ invoiceId: invoice.id }, invoice.status === "paid" ? "Credits added" : "Invoice issued — the credits are added when it is paid");
});

export const quotePlanPriceAction = createAction(z.object({ planPriceId: f.uuid(), couponCode: z.string().trim().max(40).optional(), portal: portalField }), async (input) => {
  const ctx = await memberContext(input.portal, "view");
  return ok(await service.quotePlanPrice(ctx, input));
});

export const adjustCreditsAction = createFormAction(creditAdjustmentSchema, async (input) => {
  const ctx = await requireStaff("commercial.plans");
  const result = await service.adjustCredits(ctx, { ...input, entitlementKey: input.entitlementKey as EntitlementKey });
  revalidatePath(ADMIN, "layout");
  return ok({ balanceAfter: result.balanceAfter }, "Credits adjusted");
});

// ---------------------------------------------------------------------------
// Partner settlements
// ---------------------------------------------------------------------------

export const computeSettlementAction = createFormAction(settlementComputeSchema, async (input) => {
  const ctx = await requireStaff("partners.settlements");
  const result = await service.computeSettlementDrafts(ctx, input);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(result, result.settlements.length ? "Settlement drafts updated" : "No placement fees are payable for this period");
});

export const addSettlementLineAction = createFormAction(settlementLineSchema, async (input) => {
  const ctx = await requireStaff("partners.settlements");
  await service.addSettlementLine(ctx, input);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(undefined, "Line added");
});

export const removeSettlementLineAction = createAction(z.object({ lineId: f.uuid() }), async ({ lineId }) => {
  const ctx = await requireStaff("partners.settlements");
  await service.removeSettlementLine(ctx, lineId);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(undefined, "Line removed");
});

export const updateSettlementDraftAction = createFormAction(settlementUpdateSchema, async (input) => {
  const ctx = await requireStaff("partners.settlements");
  await service.updateSettlementDraft(ctx, input);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(undefined, "Settlement saved");
});

export const submitSettlementAction = createAction(z.object({ settlementId: f.uuid() }), async ({ settlementId }) => {
  const ctx = await requireStaff("partners.settlements");
  await service.submitSettlement(ctx, settlementId);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(undefined, "Settlement sent for approval");
});

export const markSettlementPaidAction = createFormAction(settlementPaidSchema, async (input) => {
  const ctx = await requireStaff("partners.settlements");
  await service.markSettlementPaid(ctx, input);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(undefined, "Settlement marked as paid");
});

export const cancelSettlementAction = createFormAction(z.object({ settlementId: f.uuid(), reason: f.text({ label: "Reason", min: 5, max: 500 }) }), async ({ settlementId, reason }) => {
  const ctx = await requireStaff("partners.settlements");
  await service.cancelSettlement(ctx, settlementId, reason);
  revalidatePath(`${ADMIN}/settlements`);
  return ok(undefined, "Settlement cancelled");
});

export const resolveSettlementDisputeAction = createFormAction(
  z.object({ settlementId: f.uuid(), outcome: z.enum(["approved", "paid", "draft"]), note: f.text({ label: "Note", min: 5, max: 1000 }) }),
  async (input) => {
    const ctx = await requireStaff("partners.settlements");
    await service.resolveSettlementDispute(ctx, input);
    revalidatePath(`${ADMIN}/settlements`);
    return ok(undefined, "Dispute resolved");
  },
);

export const disputeSettlementAction = createFormAction(settlementDisputeSchema, async (input) => {
  const ctx = await requireOrgMember("recruitment_partner", "partner.settlements.view");
  await service.disputeSettlement(ctx, input);
  revalidatePath(PARTNER_SETTLEMENTS_PATH);
  return ok(undefined, "Your query has been sent to the Venkat Sai finance team");
});

export const submitPartnerInvoiceAction = createFormAction(partnerInvoiceSchema, async (input) => {
  const ctx = await requireOrgMember("recruitment_partner", "partner.settlements.view");
  await service.submitPartnerInvoice(ctx, input);
  revalidatePath(PARTNER_SETTLEMENTS_PATH);
  return ok(undefined, "Invoice details saved");
});
