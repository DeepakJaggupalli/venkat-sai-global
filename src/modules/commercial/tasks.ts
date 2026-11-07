import "server-only";

import type { TaskHandlers } from "@/server/tasks/types";

import { markOverdueInvoices } from "./invoices";
import { expireStaleCheckouts } from "./payments";
import { processApprovedRefund } from "./refunds";
import { processSubscriptionRenewals } from "./subscriptions";

/**
 * Background task handlers owned by the commercial module (registered in src/server/tasks/registry.ts):
 *  - commercial.renewals (daily, src/server/tasks/schedule.ts): expire due credits; renewal reminders 7 and 1 days
 *    before the period end; renewal invoices; period changes; past_due → expired after the grace period
 *    (commercial.grace_period_days, default 7); unpaid pending subscriptions cancelled; monthly / yearly
 *    allowances topped up; issued invoices past their due date marked overdue; abandoned checkouts failed.
 *  - commercial.process_refund { refundId }: send an approved gateway refund to Razorpay / Stripe (retried with
 *    backoff on provider or network errors).
 * Both are idempotent.
 */
export const tasks: TaskHandlers = {
  "commercial.renewals": async (_payload, ctx) => {
    const now = new Date();
    const summary = await processSubscriptionRenewals(now);
    const overdue = await markOverdueInvoices(now);
    const abandoned = await expireStaleCheckouts(now);
    ctx.log("commercial.renewals finished", { ...summary, overdueInvoices: overdue, abandonedCheckouts: abandoned });
  },
  "commercial.process_refund": async (payload, ctx) => {
    const refundId = typeof payload.refundId === "string" ? payload.refundId : null;
    if (!refundId) {
      ctx.log("commercial.process_refund without refundId — ignored");
      return;
    }
    const status = await processApprovedRefund(refundId);
    ctx.log("commercial.process_refund finished", { refundId, status });
  },
};
