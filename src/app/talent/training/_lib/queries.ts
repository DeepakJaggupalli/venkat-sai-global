import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { batches } from "@/db/schema";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

/**
 * Small read helpers for the People Portal training pages that the training module does not expose yet
 * (reported as cross-module needs). Callers must already have authorised access to the batch.
 */

/** Organisation running a batch: null for a Venkat Sai batch. */
export async function batchOrganizationId(batchId: string): Promise<string | null> {
  const [row] = await db.select({ organizationId: batches.organizationId }).from(batches).where(eq(batches.id, batchId)).limit(1);
  return row?.organizationId ?? null;
}

export type FeePaymentInfo = {
  /** Online card / UPI payments are switched on platform-wide. */
  onlinePayments: boolean;
  /** Venkat Sai's offline payment instructions (printed on invoices), when configured. */
  venkatSaiInstructions: string | null;
};

/** Payment details shown for course fees. Instructions are only offered while online payments are off. */
export async function feePaymentInfo(): Promise<FeePaymentInfo> {
  const [onlinePayments, seller] = await Promise.all([isFeatureEnabled("commercial.online_payments"), getSetting("commercial.seller_details")]);
  const raw = (seller as { paymentInstructions?: unknown } | null)?.paymentInstructions;
  const instructions = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return { onlinePayments, venkatSaiInstructions: onlinePayments ? null : instructions };
}
