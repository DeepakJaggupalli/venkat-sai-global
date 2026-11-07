import "server-only";

/**
 * Public write API of the commercial module (barrel). Every function authorises the actor it receives
 * (StaffContext with commercial.* / partners.settlements permissions, or an OrgContext with the billing permission
 * of its organisation type) and scopes the records it touches. See README.md for the full contract.
 */
export { createPlan, updatePlan, setDefaultPlan, addPlanPrice, deactivatePlanPrice, setPlanPriceProviderIds, setPlanFeature, removePlanFeature, validateFeature } from "./plans";
export { saveCoupon, setCouponActive, validateCoupon } from "./coupons";
export { upsertBillingProfile, getBillingProfile } from "./billing-profiles";
export { saveTaxRate, confirmTaxRate, listTaxRates } from "./tax-rates";
export {
  saveDraftInvoice,
  deleteDraftInvoice,
  applyCouponToDraft,
  removeCouponFromDraft,
  issueInvoice,
  voidInvoice,
  markOverdueInvoices,
  deriveInvoiceStatus,
  outstandingMinor,
} from "./invoices";
export { recordOfflinePayment, allocatePayment, expireStaleCheckouts } from "./payments";
export { startInvoiceCheckout, verifyRazorpayCheckout, getCheckoutStatus, gatewayAmountProblem } from "./checkout";
export {
  startSubscription,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  setAutoRenew,
  requestSubscriptionException,
  processSubscriptionRenewals,
  subscriptionsRenewingWithin,
} from "./subscriptions";
export { purchaseCreditPack, quotePlanPrice } from "./purchases";
export { adjustCredits, expireDueCredits, getCreditBalance, getCreditBalances } from "./credits";
export { requestRefund, resubmitRefund, completeManualRefund, retryRefund, processApprovedRefund } from "./refunds";
export { openDispute, updateDispute } from "./disputes";
export {
  computeSettlementDrafts,
  addSettlementLine,
  removeSettlementLine,
  updateSettlementDraft,
  submitSettlement,
  markSettlementPaid,
  cancelSettlement,
  disputeSettlement,
  resolveSettlementDispute,
  submitPartnerInvoice,
} from "./settlements";
export { handleRazorpayWebhook, handleStripeWebhook } from "./webhooks";
export { seedDefaultTaxRates } from "./seed";
