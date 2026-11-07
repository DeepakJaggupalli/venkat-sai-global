"use client";

import { Check, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SimpleSelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { track } from "@/modules/analytics/client";
import type { PlanView } from "@/modules/commercial/types";

import { INTERVAL_LABELS, INTERVAL_SUFFIX } from "./labels";
import { availableCurrencies, pickCurrency, pricesIn } from "./plan-utils";
import type { BillingPortal } from "./portal-config";
import { PurchaseDialog, type PurchaseTarget } from "./purchase-dialog";

type Props = {
  portal: BillingPortal;
  /** Public, active plans of the audience (base plans for "plans", add-ons with one-time prices for "credits"). */
  plans: PlanView[];
  mode: "plans" | "credits";
  /** Current live base subscription (plan changes) — null when none. */
  current: { subscriptionId: string; planId: string } | null;
  /** A plan change / first subscription is already waiting for payment. */
  hasPending: boolean;
  preferredCurrencies: (string | null)[];
  canManage: boolean;
  /** Self-serve purchases switched on (commercial.subscriptions). */
  selfServe: boolean;
  onlinePayments: { razorpay: boolean; stripe: boolean };
  detailsHref: string;
  contactHref: string;
};

/**
 * Public plans (or credit packs) with prices in the organisation's currency. Prices are data from the catalogue;
 * when nothing is priced the honest next step is to talk to the team.
 */
export function PlanPicker({ portal, plans, mode, current, hasPending, preferredCurrencies, canManage, selfServe, onlinePayments, detailsHref, contactHref }: Props) {
  const currencies = useMemo(() => availableCurrencies(plans), [plans]);
  const [currency, setCurrency] = useState<string | null>(() => pickCurrency(currencies, preferredCurrencies));
  const [target, setTarget] = useState<PurchaseTarget | null>(null);

  if (!plans.length || !currencies.length) {
    return (
      <EmptyState
        icon={<MessageSquare className="size-5" aria-hidden="true" />}
        title={mode === "credits" ? "No credit packs are offered online yet" : "Plans are arranged with our team"}
        description={
          mode === "credits"
            ? "Talk to our team if you need more credits. We will set them up and send an invoice."
            : "We agree plans and pricing with each organisation. Talk to our team and we will set up the right plan for you."
        }
        primaryAction={{ label: "Talk to our team", href: contactHref }}
        size="sm"
      />
    );
  }

  const visible = plans.filter((p) => p.contactSalesOnly || pricesIn(p, currency, mode === "credits" ? { oneTimeOnly: true } : { recurringOnly: true }).length);

  return (
    <div className="space-y-5">
      {currencies.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor={`${mode}-currency`} className="text-sm">
            Show prices in
          </Label>
          <SimpleSelect
            id={`${mode}-currency`}
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={currency ?? undefined}
            onValueChange={(v) => setCurrency(v)}
            className="w-28"
          />
        </div>
      ) : null}
      {!selfServe ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          Online sign-up is paused. <Link href={contactHref} className="font-medium underline underline-offset-4">Talk to our team</Link> to change your plan.
        </p>
      ) : !canManage ? (
        <p className="text-sm text-muted-foreground">Ask a colleague with billing access to change the plan or buy credits.</p>
      ) : hasPending && mode === "plans" ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">A plan change is waiting for payment. Pay or wait for that invoice before choosing another plan.</p>
      ) : null}
      <ul className={cn("grid gap-4", visible.length > 1 ? "md:grid-cols-2 xl:grid-cols-3" : "max-w-md")}>
        {visible.map((plan) => {
          const isCurrent = current?.planId === plan.id;
          const prices = pricesIn(plan, currency, mode === "credits" ? { oneTimeOnly: true } : { recurringOnly: true });
          const disabled = !selfServe || !canManage || (mode === "plans" && (hasPending || isCurrent));
          return (
            <li key={plan.id} className={cn("flex flex-col rounded-xl border bg-background p-5", isCurrent && "border-teal ring-1 ring-teal")} data-testid={`plan-${plan.key}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold text-foreground">{plan.name}</h3>
                {isCurrent ? <StatusBadge tone="brand" size="sm">Current plan</StatusBadge> : null}
              </div>
              {plan.description ? <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p> : null}
              {plan.highlights.length || plan.features.length ? (
                <ul className="mt-4 space-y-1.5 text-sm">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden="true" />
                      <span>{h}</span>
                    </li>
                  ))}
                  {plan.features.map((f) => (
                    <li key={f.entitlementKey} className="flex gap-2 text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden="true" />
                      <span>
                        {f.label}: {f.limitValue === null ? "unlimited" : f.limitValue}
                        {f.period === "month" ? " per month" : f.period === "year" ? " per year" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {mode === "plans" && plan.trialDays > 0 ? <p className="mt-3 text-sm text-teal-strong">{plan.trialDays}-day trial for new subscribers</p> : null}
              <div className="mt-auto space-y-2 pt-5">
                {plan.contactSalesOnly || !prices.length ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link href={contactHref}>Talk to our team</Link>
                  </Button>
                ) : (
                  prices.map((price) => (
                    <div key={price.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-subtle px-3 py-2">
                      <div>
                        <p className="font-heading text-base font-semibold tabular-nums text-foreground">
                          <MoneyText amountMinor={price.amountMinor} currency={price.currency} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {INTERVAL_SUFFIX[price.interval]}
                          {price.taxInclusive ? ", tax included" : ", plus applicable tax"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={disabled}
                        aria-label={`${mode === "credits" ? "Buy" : current ? "Switch to" : "Choose"} ${plan.name} ${INTERVAL_LABELS[price.interval].toLowerCase()}`}
                        onClick={() => {
                          track("cta_click", { cta: mode === "credits" ? "credit_pack_selected" : "plan_selected", interval: price.interval });
                          setTarget({
                            mode: mode === "credits" ? "credit_pack" : current ? "change" : "subscribe",
                            planId: plan.id,
                            planName: plan.name,
                            priceId: price.id,
                            amountMinor: price.amountMinor,
                            currency: price.currency,
                            interval: price.interval,
                            trialDays: plan.trialDays,
                            subscriptionId: current?.subscriptionId,
                          });
                        }}
                      >
                        {mode === "credits" ? "Buy" : isCurrent ? "Current" : current ? "Switch" : "Choose"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is priced in {currency} yet. <Link href={contactHref} className="font-medium text-teal-strong underline underline-offset-4">Talk to our team</Link>.
        </p>
      ) : null}
      <PurchaseDialog key={target?.mode ?? "none"} portal={portal} target={target} onClose={() => setTarget(null)} onlinePayments={onlinePayments} detailsHref={detailsHref} />
    </div>
  );
}
