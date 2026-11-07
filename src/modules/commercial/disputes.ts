import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { currencies, disputes, invoices, payments, type DisputeStatus } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";
import { notifyStaff } from "@/modules/notifications";

import { assertOrgBilling, assertStaff, isOrgActor, type BillingActor } from "./access";
import { ADMIN_COMMERCIAL_PATHS, BILLING_PATHS } from "./constants";
import { invalidState, notFound } from "./errors";
import { minorUnitsFor, parseDecimalToMinor } from "./money";
import { notifyBillingContacts } from "./notify";
import type { DisputeOpenInput } from "./schemas";

/**
 * Billing disputes about an invoice and / or payment. Raised by organisation billing members (about their own
 * documents) or staff; handled by staff with commercial.refunds: open → under_review → resolved | rejected. A
 * resolution that involves money back goes through a refund (approval "refund").
 */

export type DisputeRow = typeof disputes.$inferSelect;

export async function openDispute(actor: BillingActor, input: DisputeOpenInput): Promise<DisputeRow> {
  if (!isOrgActor(actor)) assertStaff(actor, "commercial.refunds");
  return db.transaction(async (tx) => {
    let organizationId: string | null = null;
    let currency: string | null = null;
    let invoiceId = input.invoiceId ?? null;
    if (input.paymentId) {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
      if (!payment) throw notFound("Payment");
      organizationId = payment.organizationId;
      currency = payment.currency;
      if (invoiceId && payment.invoiceId && payment.invoiceId !== invoiceId) throw invalidState("The payment belongs to another invoice.");
      invoiceId = invoiceId ?? payment.invoiceId;
    }
    if (invoiceId) {
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!invoice || invoice.status === "draft") throw notFound("Invoice");
      if (organizationId && invoice.organizationId !== organizationId) throw invalidState("The invoice and payment belong to different organisations.");
      organizationId = invoice.organizationId;
      currency = currency ?? invoice.currency;
    }
    if (isOrgActor(actor)) {
      if (!organizationId || organizationId !== actor.organization.id) throw notFound(input.paymentId ? "Payment" : "Invoice");
      assertOrgBilling(actor, "view");
    }
    let amountMinor: number | null = null;
    if (input.amount && currency) {
      const [cur] = await tx.select({ minorUnits: currencies.minorUnits }).from(currencies).where(eq(currencies.code, currency)).limit(1);
      const parsed = parseDecimalToMinor(input.amount, minorUnitsFor(currency, cur?.minorUnits));
      if (!parsed.ok || parsed.minor <= 0) throw new ActionError("Enter a valid amount.", { fieldErrors: { amount: ["Invalid amount"] } });
      amountMinor = parsed.minor;
    }
    const [row] = await tx
      .insert(disputes)
      .values({
        source: "customer",
        paymentId: input.paymentId ?? null,
        invoiceId,
        organizationId,
        amountMinor,
        currency: amountMinor !== null ? currency : null,
        reason: input.reason,
        openedByUserId: actor.user.id,
      })
      .returning();
    await notifyStaff(
      { event: "billing.dispute_updated", permission: "commercial.refunds", data: { forStaff: true, status: "open", reason: input.reason.slice(0, 200) }, link: ADMIN_COMMERCIAL_PATHS.dispute(row!.id), dedupeKey: `dispute-open:${row!.id}` },
      { tx },
    );
    await audit({ action: "commercial.dispute_opened", entityType: "dispute", entityId: row!.id, organizationId, actorUserId: actor.user.id, actorType: isOrgActor(actor) ? "user" : "staff", metadata: { paymentId: input.paymentId ?? null, invoiceId, amountMinor, currency }, tx });
    return row!;
  });
}

const TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ["under_review", "resolved", "rejected"],
  under_review: ["resolved", "rejected", "open"],
  resolved: [],
  rejected: [],
};

export async function updateDispute(ctx: StaffContext, input: { disputeId: string; status: DisputeStatus; resolution?: string }): Promise<DisputeRow> {
  assertStaff(ctx, "commercial.refunds");
  return db.transaction(async (tx) => {
    const [dispute] = await tx.select().from(disputes).where(eq(disputes.id, input.disputeId)).limit(1).for("update");
    if (!dispute) throw notFound("Dispute");
    if (!TRANSITIONS[dispute.status].includes(input.status)) throw invalidState(`A ${dispute.status.replace("_", " ")} dispute cannot move to ${input.status.replace("_", " ")}.`);
    const closing = input.status === "resolved" || input.status === "rejected";
    if (closing && !input.resolution?.trim()) throw new ActionError("Explain the outcome so the organisation knows what was decided.", { fieldErrors: { resolution: ["Required"] } });
    const [row] = await tx
      .update(disputes)
      .set({ status: input.status, resolution: input.resolution?.trim() || dispute.resolution, resolvedByUserId: closing ? ctx.user.id : null, resolvedAt: closing ? new Date() : null })
      .where(eq(disputes.id, dispute.id))
      .returning();
    if (dispute.source === "customer") {
      await notifyBillingContacts(tx, {
        event: "billing.dispute_updated",
        organizationId: dispute.organizationId,
        data: { status: input.status, resolution: closing ? (input.resolution ?? null) : null },
        link: dispute.invoiceId ? BILLING_PATHS.invoice(dispute.invoiceId) : null,
        dedupeKey: `dispute-update:${dispute.id}:${input.status}`,
      });
    }
    await audit({ action: `commercial.dispute_${input.status}`, entityType: "dispute", entityId: dispute.id, organizationId: dispute.organizationId, actorUserId: ctx.user.id, actorType: "staff", metadata: { from: dispute.status, to: input.status }, tx });
    return row!;
  });
}

