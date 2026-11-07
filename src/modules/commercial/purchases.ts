import "server-only";

import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { planPrices, plans } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import { isFeatureEnabled } from "@/modules/settings";

import { authorizeOrgBilling, isOrgActor, type BillingActor } from "./access";
import { getCommercialConfig, getSellerDetails } from "./config";
import { toCouponDiscount, validateCoupon } from "./coupons";
import { invalidState, notFound } from "./errors";
import { fulfilPaidInvoiceTx } from "./fulfilment";
import { buildTaxContext, createAndIssueInvoice, resolveBuyer, type InvoiceRow } from "./invoices";
import { priceInvoice, type InvoiceTotals } from "./pricing";
import type { TaxDetermination } from "./tax";

/**
 * One-time purchases: credit packs (add-on plans sold with a one_time price). The invoice is issued at once; the
 * credits are granted when it is paid (fulfilment.ts), expiring after the plan feature's period (none = never).
 * Quotes price a plan price for the organisation's billing profile without writing anything.
 */

async function loadPrice(planPriceId: string, tx: DbOrTx = db) {
  const [row] = await tx.select({ price: planPrices, plan: plans }).from(planPrices).innerJoin(plans, eq(plans.id, planPrices.planId)).where(eq(planPrices.id, planPriceId)).limit(1);
  if (!row) throw notFound("Price");
  return row;
}

export async function purchaseCreditPack(actor: BillingActor, input: { planPriceId: string; couponCode?: string; organizationId?: string }): Promise<InvoiceRow> {
  const organizationId = isOrgActor(actor) ? actor.organization.id : input.organizationId;
  if (!organizationId) throw new ActionError("Choose the organisation.", { fieldErrors: { organizationId: ["Required"] } });
  if (isOrgActor(actor) && !(await isFeatureEnabled("commercial.subscriptions", { organizationId }))) {
    throw new ActionError("Purchases are not available at the moment. Please contact us.", { code: "feature_disabled" });
  }
  return db.transaction(async (tx) => {
    const org = await authorizeOrgBilling(actor, organizationId, { level: "manage", staffPermission: "commercial.invoices" }, tx);
    const { price, plan } = await loadPrice(input.planPriceId, tx);
    if (!price.isActive || !plan.isActive || plan.kind !== "add_on" || price.interval !== "one_time") throw invalidState("This credit pack is not available.");
    if (plan.audience !== org.type) throw invalidState("This credit pack is not available for your type of organisation.");
    if (isOrgActor(actor) && plan.contactSalesOnly) throw invalidState("This pack is arranged with our team. Please contact us.");
    let coupon = null;
    if (input.couponCode) {
      const validation = await validateCoupon({ code: input.couponCode, currency: price.currency, planId: plan.id, organizationId }, tx);
      if (!validation.ok) throw new ActionError(validation.reason, { fieldErrors: { couponCode: [validation.reason] } });
      coupon = validation.coupon;
    }
    const now = new Date();
    const invoice = await createAndIssueInvoice(tx, {
      organizationId,
      currency: price.currency,
      lines: [{ description: `${plan.name} (credit pack)`, quantity: 1, unitAmountMinor: price.amountMinor, taxInclusive: price.taxInclusive, referenceType: "credit_pack", referenceId: price.id }],
      coupon,
      actorUserId: actor.user.id,
      now,
    });
    if (invoice.status === "paid") await fulfilPaidInvoiceTx(tx, invoice, now, actor.user.id);
    await audit({ action: "commercial.credit_pack_ordered", entityType: "invoice", entityId: invoice.id, organizationId, actorUserId: actor.user.id, actorType: isOrgActor(actor) ? "user" : "staff", metadata: { planId: plan.id, planPriceId: price.id, totalMinor: invoice.totalMinor, currency: invoice.currency }, tx });
    return invoice;
  });
}

export type PriceQuote = {
  currency: string;
  totals: InvoiceTotals;
  couponDiscountMinor: number;
  determination: Pick<TaxDetermination, "treatment" | "supply" | "placeOfSupply" | "note">;
  taxes: { name: string; rateBasisPoints: number; amountMinor: number }[];
  /** Why the purchase cannot proceed yet (e.g. billing details missing), shown before checkout. */
  problems: string[];
  couponError: string | null;
};

/** Price a plan price (with optional coupon) for the organisation, as the invoice would be issued now. */
export async function quotePlanPrice(actor: BillingActor, input: { planPriceId: string; couponCode?: string; organizationId?: string }): Promise<PriceQuote> {
  const organizationId = isOrgActor(actor) ? actor.organization.id : input.organizationId;
  if (!organizationId) throw new ActionError("Choose the organisation.");
  const org = await authorizeOrgBilling(actor, organizationId, { level: "view", staffPermission: "commercial.view" });
  const { price, plan } = await loadPrice(input.planPriceId);
  if (plan.audience !== org.type) throw invalidState("This plan is not available for your type of organisation.");
  const seller = await getSellerDetails();
  const buyer = await resolveBuyer(db, { organizationId, buyerUserId: null }, seller);
  const problems: string[] = [];
  const taxBuyer = "problem" in buyer ? { countryCode: null, stateCode: null, taxExempt: false } : buyer.tax;
  if ("problem" in buyer) problems.push(buyer.problem);
  const ctx = await buildTaxContext(db, { buyer: taxBuyer, seller, at: new Date() });
  let couponError: string | null = null;
  let coupon = null;
  if (input.couponCode) {
    const validation = await validateCoupon({ code: input.couponCode, currency: price.currency, planId: plan.id, organizationId });
    if (validation.ok) coupon = validation.coupon;
    else couponError = validation.reason;
  }
  const config = await getCommercialConfig();
  const priced = priceInvoice(
    [{ description: plan.name, quantity: 1, unitAmountMinor: price.amountMinor, taxInclusive: price.taxInclusive, taxCode: config["commercial.default_tax_code"] }],
    ctx,
    coupon ? toCouponDiscount(coupon) : null,
  );
  for (const p of priced.problems) if (!problems.includes(p)) problems.push(p);
  const taxes = priced.lines.flatMap((l) => l.taxes.map((t) => ({ name: t.name, rateBasisPoints: t.rateBasisPoints, amountMinor: t.amountMinor })));
  return {
    currency: price.currency,
    totals: priced.totals,
    couponDiscountMinor: priced.couponDiscountMinor,
    determination: { treatment: priced.determination.treatment, supply: priced.determination.supply, placeOfSupply: priced.determination.placeOfSupply, note: priced.determination.note },
    taxes,
    problems,
    couponError,
  };
}
