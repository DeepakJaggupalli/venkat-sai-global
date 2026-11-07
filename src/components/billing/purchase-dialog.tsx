"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Callout } from "@/components/shared/callout";
import { FormErrorAlert, FormField, SubmitButton } from "@/components/shared/form";
import { MoneyText } from "@/components/shared/money-text";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { track } from "@/modules/analytics/client";
import { changePlanAction, purchaseCreditPackAction, quotePlanPriceAction, startSubscriptionAction } from "@/modules/commercial/actions";
import { formatRate } from "@/modules/commercial/tax";

import { INTERVAL_SUFFIX } from "./labels";
import type { BillingPortal } from "./portal-config";
import { useBillingForm } from "./use-billing-form";

type Quote = {
  currency: string;
  totals: { subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number };
  taxes: { name: string; rateBasisPoints: number; amountMinor: number }[];
  determination: { note: string | null };
  problems: string[];
  couponError: string | null;
};

export type PurchaseTarget = {
  mode: "subscribe" | "change" | "credit_pack";
  planId: string;
  planName: string;
  priceId: string;
  amountMinor: number;
  currency: string;
  interval: keyof typeof INTERVAL_SUFFIX;
  trialDays?: number;
  /** Required for "change". */
  subscriptionId?: string;
};

type Props = {
  portal: BillingPortal;
  target: PurchaseTarget | null;
  onClose: () => void;
  onlinePayments: { razorpay: boolean; stripe: boolean };
  detailsHref: string;
};

/**
 * Confirmation step for subscribing, changing plan or buying credits: shows the tax-inclusive quote the invoice
 * would carry (server-priced), accepts a coupon, then creates the subscription / invoice. When an invoice is
 * created the buyer goes to the printable invoice, which offers online payment only when it is enabled and
 * otherwise shows the offline payment instructions.
 */
export function PurchaseDialog(props: Props) {
  if (!props.target) return null;
  return <PurchaseDialogBody key={`${props.target.mode}:${props.target.priceId}`} {...props} target={props.target} />;
}

function PurchaseDialogBody({ portal, target, onClose, onlinePayments, detailsHref }: Props & { target: PurchaseTarget }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>(undefined);
  const [quoting, startQuote] = useTransition();

  const action = target.mode === "change" ? changePlanAction : target.mode === "credit_pack" ? purchaseCreditPackAction : startSubscriptionAction;
  const { state, pending, onSubmit } = useBillingForm<{ invoiceId?: string | null }>(action as never, {
    refresh: true,
    onSuccess: (data) => {
      track("form_submitted", { form: target.mode === "credit_pack" ? "credit_pack" : "subscription" });
      onClose();
      const invoiceId = data && "invoiceId" in data ? data.invoiceId : null;
      if (invoiceId) router.push(`/billing/invoices/${invoiceId}`);
    },
  });

  const priceId = target.priceId;
  const requestQuote = useCallback(
    (couponCode: string | undefined) => {
      startQuote(async () => {
        const result = await quotePlanPriceAction({ planPriceId: priceId, couponCode, portal });
        if (result.ok && result.data) {
          setQuote(result.data as Quote);
          setQuoteError(null);
        } else setQuoteError(result.ok ? "The price could not be calculated." : result.error);
      });
    },
    [priceId, portal],
  );

  useEffect(() => {
    requestQuote(undefined);
  }, [requestQuote]);

  const online = onlinePayments.razorpay || onlinePayments.stripe;
  const blocked = Boolean(quote?.problems.length);
  const title = target.mode === "credit_pack" ? `Buy ${target.planName}` : target.mode === "change" ? `Switch to ${target.planName}` : `Subscribe to ${target.planName}`;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={title}
      description={
        <>
          <MoneyText amountMinor={target.amountMinor} currency={target.currency} /> {INTERVAL_SUFFIX[target.interval]}
        </>
      }
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-5" aria-label={title} noValidate>
        <input type="hidden" name="portal" value={portal} />
        <input type="hidden" name="planPriceId" value={target.priceId} />
        {target.mode !== "credit_pack" ? <input type="hidden" name="planId" value={target.planId} /> : null}
        {target.mode === "subscribe" ? <input type="hidden" name="autoRenew" value="on" /> : null}
        {target.mode === "change" && target.subscriptionId ? <input type="hidden" name="subscriptionId" value={target.subscriptionId} /> : null}
        {appliedCoupon ? <input type="hidden" name="couponCode" value={appliedCoupon} /> : null}
        <FormErrorAlert state={state} />

        <div aria-live="polite" aria-busy={quoting} className="rounded-lg border bg-surface-subtle p-4">
          {quoting && !quote ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Calculating the price with tax…
            </p>
          ) : quoteError ? (
            <p className="text-sm text-danger-strong">{quoteError}</p>
          ) : quote ? (
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal">
                <MoneyText amountMinor={quote.totals.subtotalMinor} currency={quote.currency} />
              </Row>
              {quote.totals.discountMinor > 0 ? (
                <Row label="Discount">
                  − <MoneyText amountMinor={quote.totals.discountMinor} currency={quote.currency} />
                </Row>
              ) : null}
              {quote.taxes.map((t) => (
                <Row key={`${t.name}-${t.rateBasisPoints}`} label={`${t.name} (${formatRate(t.rateBasisPoints)})`}>
                  <MoneyText amountMinor={t.amountMinor} currency={quote.currency} />
                </Row>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t pt-2 font-medium text-foreground">
                <dt>Total</dt>
                <dd className="font-heading text-lg tabular-nums">
                  <MoneyText amountMinor={quote.totals.totalMinor} currency={quote.currency} />
                </dd>
              </div>
              {quote.determination.note ? <p className="pt-1 text-xs text-muted-foreground">{quote.determination.note}</p> : null}
            </dl>
          ) : null}
        </div>

        {quote?.couponError ? <p className="text-sm text-danger-strong">{quote.couponError}</p> : null}
        <div className="flex items-end gap-2">
          <FormField label="Coupon code" name="couponCodeInput" optional>
            <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" className="uppercase" />
          </FormField>
          <Button type="button" variant="outline" disabled={!coupon.trim() || quoting} onClick={() => {
              const code = coupon.trim() || undefined;
              setAppliedCoupon(code);
              requestQuote(code);
            }}>
            Apply
          </Button>
        </div>

        {blocked ? (
          <Callout tone="warning" title="Before you can continue" action={{ label: "Update billing details", href: detailsHref }}>
            <ul className="list-disc space-y-1 pl-5">
              {quote!.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <div className="space-y-1 text-sm text-muted-foreground">
          {target.mode === "subscribe" && target.trialDays ? (
            <p>If this is your first time on this plan, a {target.trialDays}-day trial starts now and the first invoice follows when the trial ends.</p>
          ) : target.mode === "change" ? (
            <p>Your new plan starts as soon as its first invoice is paid. Unused time on your current plan is not credited automatically; contact our finance team if you need an adjustment.</p>
          ) : target.mode === "credit_pack" ? (
            <p>The credits are added as soon as the invoice is paid.</p>
          ) : (
            <p>Your plan starts as soon as the first invoice is paid.</p>
          )}
          <p>
            {online
              ? "You can pay the invoice online or by bank transfer."
              : "We will issue an invoice for your finance team. It shows how to pay by bank transfer; the plan starts once our team records the payment."}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingLabel="Creating invoice…" disabled={blocked || quoting || !quote}>
            {online ? "Continue to invoice" : "Request invoice"}
          </SubmitButton>
        </div>
        <p className="text-xs text-muted-foreground">
          Prices and taxes are confirmed on the invoice. See <Link href={detailsHref} className="underline underline-offset-4">billing details</Link> to change the name, tax number or address printed on it.
        </p>
      </form>
    </ResponsiveDialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{children}</dd>
    </div>
  );
}
