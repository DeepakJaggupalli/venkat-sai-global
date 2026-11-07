import { CircleSlash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { sp, type SearchParams } from "@/lib/http";
import { BILLING_PATHS } from "@/modules/commercial/constants";
import { requireUser } from "@/modules/identity/session";

import { BillingFrame } from "../../_components/billing-frame";

export const metadata: Metadata = {
  title: "Payment cancelled",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /billing/checkout/cancel?invoice=… — Stripe Checkout's cancel URL. Nothing is charged; the abandoned checkout is
 * marked failed by the daily commercial.renewals run. The invoice link is only a link: the invoice page checks access.
 */
export default async function CheckoutCancelPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const invoiceId = sp(params, "invoice");
  const safeInvoiceId = invoiceId && UUID_RE.test(invoiceId) ? invoiceId : null;
  await requireUser({ returnTo: `${BILLING_PATHS.checkoutCancel}${safeInvoiceId ? `?invoice=${safeInvoiceId}` : ""}` });

  return (
    <BillingFrame>
      <div className="rounded-xl border border-border bg-white p-6 shadow-xs sm:p-8">
        <div className="flex items-start gap-3">
          <CircleSlash className="size-8 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-2">
            <h1 className="font-heading text-xl font-semibold text-navy">Payment cancelled</h1>
            <p className="text-sm text-muted-foreground">You left the payment page before paying, so you have not been charged. The invoice is still open: you can pay online again or by bank transfer.</p>
          </div>
        </div>
        {safeInvoiceId ? (
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href={BILLING_PATHS.invoice(safeInvoiceId)}>Back to the invoice</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </BillingFrame>
  );
}
