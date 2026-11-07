import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { sp, type SearchParams } from "@/lib/http";
import { getCheckoutStatus, type CheckoutStatus } from "@/modules/commercial/checkout";
import { BILLING_PATHS } from "@/modules/commercial/constants";
import { requireUser } from "@/modules/identity/session";

import { BillingFrame } from "../../_components/billing-frame";

export const metadata: Metadata = {
  title: "Payment status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const REFERENCE_RE = /^[A-Za-z0-9_]{6,100}$/;

/**
 * /billing/checkout/success — where Stripe Checkout (`?provider=stripe&session_id=…`) and the Razorpay handler
 * (`?provider=razorpay&order_id=…`) return. Shows the real status of the payment: a delayed Stripe webhook is
 * covered by confirming the session with Stripe. Only the payer / the organisation's billing members see details.
 */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const provider = sp(params, "provider") === "razorpay" ? "razorpay" : "stripe";
  const reference = (provider === "stripe" ? sp(params, "session_id") : sp(params, "order_id")) ?? "";
  const query = new URLSearchParams({ provider, ...(provider === "stripe" ? { session_id: reference } : { order_id: reference }) }).toString();
  const user = await requireUser({ returnTo: `${BILLING_PATHS.checkoutSuccess}?${query}` });
  const status: CheckoutStatus = REFERENCE_RE.test(reference) ? await getCheckoutStatus(user, { provider, reference }) : { status: "unknown", invoiceId: null, invoiceCode: null, amountMinor: null, currency: null, failureReason: null };
  const amount = status.amountMinor !== null && status.currency ? formatMoney(status.amountMinor, status.currency) : null;

  const view = {
    succeeded: {
      icon: <CheckCircle2 className="size-8 shrink-0 text-success-strong" aria-hidden />,
      title: "Payment received",
      body: `Thank you. ${amount ? `${amount} has been received` : "Your payment has been received"}${status.invoiceCode ? ` for invoice ${status.invoiceCode}` : ""}. A receipt is on its way to your billing contacts.`,
    },
    pending: {
      icon: <Clock className="size-8 shrink-0 text-info" aria-hidden />,
      title: "We are confirming your payment",
      body: "The payment provider has not confirmed the payment yet. This usually takes a few moments. You can refresh this page; you will also be notified when it is confirmed. Please do not pay again.",
    },
    failed: {
      icon: <XCircle className="size-8 shrink-0 text-danger-strong" aria-hidden />,
      title: "The payment was not completed",
      body: `${status.failureReason ? `${status.failureReason} ` : ""}You have not been charged for this attempt. You can try again from the invoice.`,
    },
    unknown: {
      icon: <Clock className="size-8 shrink-0 text-muted-foreground" aria-hidden />,
      title: "We could not find this payment",
      body: "The link may be incomplete, or the payment belongs to another account. Open the invoice from your billing page to check its status.",
    },
  }[status.status];

  return (
    <BillingFrame>
      <div className="rounded-xl border border-border bg-white p-6 shadow-xs sm:p-8">
        <div className="flex items-start gap-3">
          {view.icon}
          <div className="space-y-2">
            <h1 className="font-heading text-xl font-semibold text-navy">{view.title}</h1>
            <p className="text-sm text-muted-foreground" role={status.status === "pending" ? "status" : undefined}>
              {view.body}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {status.invoiceId ? (
            <Button asChild size="lg">
              <Link href={BILLING_PATHS.invoice(status.invoiceId)}>View invoice</Link>
            </Button>
          ) : null}
          {status.status === "pending" ? (
            <Button asChild size="lg" variant="outline">
              <Link href={`${BILLING_PATHS.checkoutSuccess}?${query}`}>Refresh status</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </BillingFrame>
  );
}
