import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { planFeatures, planPrices } from "@/db/schema";

import { packExpiry } from "./allowances";
import { ENTITLEMENTS } from "./constants";
import { grantCredits } from "./credits";
import { getInvoiceLines, type InvoiceRow } from "./invoices";
import { onSubscriptionInvoicePaidTx } from "./subscriptions";

/**
 * What happens when an invoice becomes fully paid (inside the payment transaction):
 *  - a subscription invoice activates a pending subscription / reactivates a past-due one;
 *  - credit-pack lines (referenceType "credit_pack", referenceId = plan price id) grant purchased credits per the
 *    add-on plan's credit features × quantity, expiring after the feature period (none = no expiry).
 * Idempotent (grants use idempotency keys per invoice line and key).
 */
export async function fulfilPaidInvoiceTx(tx: DbOrTx, invoice: InvoiceRow, now: Date, actorUserId: string | null): Promise<void> {
  if (invoice.documentType !== "invoice" || !invoice.organizationId) {
    if (invoice.subscriptionId) await onSubscriptionInvoicePaidTx(tx, invoice, now);
    return;
  }
  await onSubscriptionInvoicePaidTx(tx, invoice, now);
  const lines = await getInvoiceLines(invoice.id, tx);
  for (const line of lines) {
    if (line.referenceType !== "credit_pack" || !line.referenceId) continue;
    const [price] = await tx.select({ planId: planPrices.planId }).from(planPrices).where(eq(planPrices.id, line.referenceId)).limit(1);
    if (!price) continue;
    const features = await tx.select().from(planFeatures).where(eq(planFeatures.planId, price.planId));
    for (const feature of features) {
      if (ENTITLEMENTS[feature.entitlementKey].mode !== "credit" || !feature.limitValue) continue;
      await grantCredits(
        {
          organizationId: invoice.organizationId,
          entitlementKey: feature.entitlementKey,
          delta: feature.limitValue * line.quantity,
          reason: "purchase",
          referenceType: "invoice",
          referenceId: invoice.id,
          idempotencyKey: `purchase:${line.id}:${feature.entitlementKey}`,
          expiresAt: packExpiry(feature.period, now),
          actorUserId,
          note: line.description,
        },
        tx,
      );
    }
  }
}
