import { CreditCard } from "lucide-react";

import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { ENTITLEMENTS } from "@/modules/commercial/constants";
import { getOrgBillingOverview, getPlanCatalog, listOrgCreditLedger, listOrgInvoices } from "@/modules/commercial/queries";
import type { OrgContext } from "@/modules/identity/authz";
import { isFeatureEnabled } from "@/modules/settings";

import { BillingStatusBadge } from "../billing-status";
import { INTERVAL_SUFFIX } from "../labels";
import { PlanPicker } from "../plan-picker";
import { BILLING_PORTALS, type BillingPortal } from "../portal-config";
import { SubscriptionControls } from "../subscription-controls";
import { MoneyByCurrencyList, UsageMeters } from "../usage-meters";
import { CreditLedgerTable } from "./credit-ledger-table";
import { PortalBillingHeader } from "./portal-header";

const CONTACT_HREF = "/contact";

/** /<portal>/billing — current plan, usage vs limits, credits, plans and credit packs. */
export async function PortalBillingOverview({ portal, ctx }: { portal: BillingPortal; ctx: OrgContext }) {
  const cfg = BILLING_PORTALS[portal];
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canManage = ctx.permissions.has(cfg.managePermission);
  const [overview, basePlans, addOns, selfServe, openInvoices] = await Promise.all([
    getOrgBillingOverview(ctx),
    getPlanCatalog(cfg.orgType, { kind: "base" }),
    getPlanCatalog(cfg.orgType, { kind: "add_on" }),
    isFeatureEnabled("commercial.subscriptions", { organizationId: ctx.organization.id }),
    listOrgInvoices(ctx, { status: "open" }, { page: 1, pageSize: 50, offset: 0 }),
  ]);
  const base = overview.subscriptions.find((s) => s.kind === "base") ?? null;
  const addOnSubs = overview.subscriptions.filter((s) => s.kind === "add_on");
  const creditKeys = overview.usage.items.filter((i) => i.mode === "credit");
  const creditPacks = addOns.filter((p) => p.prices.some((pr) => pr.isActive && pr.interval === "one_time"));
  const ledger = creditKeys.length ? await listOrgCreditLedger(ctx, {}, parsePage({}, { defaultSize: 10 })) : null;
  const preferred = [overview.billingProfile?.currency ?? null, base?.currency ?? null];
  const pendingInvoice = (subscriptionId: string) => openInvoices.items.find((i) => i.subscriptionId === subscriptionId) ?? null;

  return (
    <div className="space-y-8">
      <PortalBillingHeader portal={portal} title="Billing" description="Your plan, what you have used, and the plans and credits available to your organisation." />

      {overview.outstanding.length ? (
        <Callout tone="warning" title="You have unpaid invoices" action={{ label: "View invoices", href: `${cfg.base}/invoices?status=open` }}>
          Outstanding: {overview.outstanding.map((o) => formatMoney(o.amountMinor, o.currency)).join(" · ")}
        </Callout>
      ) : null}

      {overview.pendingSubscriptions.map((p) => {
        const invoice = pendingInvoice(p.id);
        return (
          <Callout
            key={p.id}
            tone="info"
            title={`${p.planName} starts when its invoice is paid`}
            action={invoice ? { label: "View and pay invoice", href: `/billing/invoices/${invoice.id}` } : undefined}
          >
            {invoice ? (
              <>
                Invoice {invoice.code ?? ""} for <MoneyText amountMinor={invoice.outstandingMinor} currency={invoice.currency} /> is waiting for payment.
              </>
            ) : (
              "Our team will send the invoice shortly."
            )}
          </Callout>
        );
      })}

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Current plan" icon={<CreditCard className="size-4" aria-hidden="true" />} className="lg:col-span-2">
          {base ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-heading text-2xl font-semibold text-foreground">{base.planName}</p>
                <BillingStatusBadge kind="subscription" status={base.status} size="md" />
              </div>
              <KeyValueList
                columns={2}
                items={[
                  {
                    label: "Price",
                    value:
                      base.amountMinor !== null && base.currency && base.interval ? (
                        <>
                          <MoneyText amountMinor={base.amountMinor} currency={base.currency} /> {INTERVAL_SUFFIX[base.interval]}
                        </>
                      ) : (
                        "Arranged with our team"
                      ),
                  },
                  { label: "Current period", value: base.currentPeriodEnd ? <><DateText value={base.currentPeriodStart} timeZone={timeZone} /> to <DateText value={base.currentPeriodEnd} timeZone={timeZone} /></> : "No end date" },
                  ...(base.trialEndsAt && base.status === "trialing" ? [{ label: "Trial ends", value: <DateText value={base.trialEndsAt} timeZone={timeZone} /> }] : []),
                  {
                    label: "Renewal",
                    value: base.cancelAtPeriodEnd ? "Ends at the end of this period" : !base.currentPeriodEnd ? "Not applicable" : base.autoRenew ? "Renews automatically (invoice 7 days before)" : "Does not renew",
                  },
                ]}
              />
              {base.status === "past_due" ? (
                <Callout tone="danger" title="Payment overdue">Your renewal invoice is unpaid. Pay it soon to keep your plan active.</Callout>
              ) : null}
              {addOnSubs.length ? (
                <p className="text-sm text-muted-foreground">Add-ons: {addOnSubs.map((a) => a.planName).join(", ")}</p>
              ) : null}
              {canManage ? (
                <SubscriptionControls
                  portal={portal}
                  subscriptionId={base.id}
                  planName={base.planName}
                  status={base.status}
                  cancelAtPeriodEnd={base.cancelAtPeriodEnd}
                  autoRenew={base.autoRenew}
                  hasPeriodEnd={Boolean(base.currentPeriodEnd)}
                />
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No paid plan yet"
              description={
                overview.usage.items.length
                  ? "Your organisation uses the standard allowances shown below. Choose a plan when you need more."
                  : "Choose a plan below, or talk to our team about one arranged for you."
              }
              variant="plain"
              size="sm"
            />
          )}
        </SectionCard>

        <SectionCard title="Balance">
          <KeyValueList
            items={[
              { label: "Outstanding", value: <MoneyByCurrencyList items={overview.outstanding} empty="Nothing to pay" /> },
              ...creditKeys.map((c) => ({ label: ENTITLEMENTS[c.key].label, value: c.limit === null && c.included ? "Unlimited" : `${c.balance ?? 0} credits` })),
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Usage" description="What your organisation is using against its plan limits.">
        <UsageMeters items={overview.usage.items} enforced={overview.usage.enforced} timeZone={timeZone} />
      </SectionCard>

      <SectionCard id="plans" title={base ? "Change plan" : "Plans"} description="Prices are shown in your billing currency where available. Candidates are never charged.">
        <PlanPicker
          portal={portal}
          mode="plans"
          plans={basePlans}
          current={base ? { subscriptionId: base.id, planId: base.planId } : null}
          hasPending={overview.pendingSubscriptions.some((p) => p.kind === "base")}
          preferredCurrencies={preferred}
          canManage={canManage}
          selfServe={selfServe}
          onlinePayments={overview.onlinePayments}
          detailsHref={`${cfg.base}/details`}
          contactHref={CONTACT_HREF}
        />
      </SectionCard>

      {creditPacks.length || creditKeys.length ? (
        <SectionCard id="credits" title="Credit top-ups" description="One-time packs that add credits to your balance once the invoice is paid.">
          <PlanPicker
            portal={portal}
            mode="credits"
            plans={creditPacks}
            current={null}
            hasPending={false}
            preferredCurrencies={preferred}
            canManage={canManage}
            selfServe={selfServe}
            onlinePayments={overview.onlinePayments}
            detailsHref={`${cfg.base}/details`}
            contactHref={CONTACT_HREF}
          />
        </SectionCard>
      ) : null}

      {ledger ? (
        <SectionCard title="Credit history" flush>
          <CreditLedgerTable rows={ledger.items} timeZone={timeZone} />
        </SectionCard>
      ) : null}
    </div>
  );
}
