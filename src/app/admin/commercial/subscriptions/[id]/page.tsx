import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { INTERVAL_SUFFIX } from "@/components/billing/labels";
import { CreditLedgerTable } from "@/components/billing/portal/credit-ledger-table";
import { InvoiceTable } from "@/components/billing/record-tables";
import { SubscriptionControls } from "@/components/billing/subscription-controls";
import { UsageMeters } from "@/components/billing/usage-meters";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { parsePage } from "@/lib/http";
import { ENTITLEMENT_KEY_LIST, ENTITLEMENTS } from "@/modules/commercial/constants";
import { getOrgBillingForStaff, getSubscriptionDetail, listCreditLedgerForStaff } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { AdjustCreditsForm, SubscriptionExceptionForm } from "../_components/subscription-forms";

export const metadata: Metadata = { title: "Subscription" };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SubscriptionPage({ params, searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getSubscriptionDetail(staff, id);
  if (!detail) notFound();
  const { subscription: s, notes, invoices } = detail;
  const [billing, ledger] = await Promise.all([getOrgBillingForStaff(staff, s.organizationId), listCreditLedgerForStaff(staff, s.organizationId, {}, parsePage(sp, { defaultSize: 15 }))]);
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const creditKeys = ENTITLEMENT_KEY_LIST.filter((k) => ENTITLEMENTS[k].mode === "credit" && ENTITLEMENTS[k].audiences.includes(billing.organization.type)).map((k) => ({ value: k, label: ENTITLEMENTS[k].label }));
  const pathname = `${ADMIN_COMMERCIAL}/subscriptions/${s.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${s.organizationName} · ${s.planName}`}
        status={<BillingStatusBadge kind="subscription" status={s.status} size="md" />}
        description={s.kind === "add_on" ? "Add-on subscription" : "Base plan subscription"}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Subscriptions", href: `${ADMIN_COMMERCIAL}/subscriptions` }, { label: s.organizationName }]}
        actions={[{ label: "All invoices of this organisation", href: `${ADMIN_COMMERCIAL}/invoices?org=${s.organizationId}`, variant: "outline" }]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Period and price" className="lg:col-span-2">
          <KeyValueList
            columns={2}
            items={[
              { label: "Price", value: s.amountMinor !== null && s.currency && s.interval ? <><MoneyText amountMinor={s.amountMinor} currency={s.currency} /> {INTERVAL_SUFFIX[s.interval]}</> : "Contract (no price)" },
              { label: "Started", value: <DateText value={s.startedAt} timeZone={timeZone} /> },
              { label: "Current period", value: s.currentPeriodEnd ? <><DateText value={s.currentPeriodStart} timeZone={timeZone} /> to <DateText value={s.currentPeriodEnd} timeZone={timeZone} /></> : "No end date" },
              { label: "Trial ends", value: s.trialEndsAt ? <DateText value={s.trialEndsAt} timeZone={timeZone} /> : "—" },
              { label: "Automatic renewal", value: s.autoRenew ? "On" : "Off" },
              { label: "Cancellation", value: s.cancelledAt ? <>Cancelled <DateText value={s.cancelledAt} timeZone={timeZone} /></> : s.cancelAtPeriodEnd ? "Ends at the period end" : "—" },
              ...(s.endedAt ? [{ label: "Ended", value: <DateText value={s.endedAt} timeZone={timeZone} /> }] : []),
              ...(notes ? [{ label: "Internal notes", value: notes, fullWidth: true }] : []),
            ]}
          />
          {staffCan(staff, "commercial.invoices") ? (
            <div className="mt-6 border-t pt-5">
              <SubscriptionControls subscriptionId={s.id} planName={s.planName} status={s.status} cancelAtPeriodEnd={s.cancelAtPeriodEnd} autoRenew={s.autoRenew} hasPeriodEnd={Boolean(s.currentPeriodEnd)} />
            </div>
          ) : null}
        </SectionCard>

        {staffCan(staff, ["commercial.invoices", "commercial.refunds"], "any") ? (
          <SectionCard title="Extend or reactivate" description="Changes to the period need a second person's approval and are audited.">
            <SubscriptionExceptionForm subscriptionId={s.id} />
          </SectionCard>
        ) : null}
      </div>

      <SectionCard title="Invoices" flush>
        <InvoiceTable audience="staff" rows={invoices} timeZone={timeZone} caption="Invoices of this subscription" />
      </SectionCard>

      <SectionCard title="Usage of the organisation">
        <UsageMeters items={billing.usage.items} enforced={billing.usage.enforced} timeZone={timeZone} />
      </SectionCard>

      <SectionCard title="Credits ledger" flush>
        <CreditLedgerTable rows={ledger.items} timeZone={timeZone} showNotes />
        <div className="px-4 pb-4 sm:px-5">
          <Pagination pathname={pathname} searchParams={sp} page={ledger.page} pageCount={ledger.pageCount} total={ledger.total} pageSize={ledger.pageSize} itemLabel="entries" />
        </div>
        {staffCan(staff, "commercial.plans") && creditKeys.length ? (
          <div className="border-t p-4 sm:p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">Manual credit adjustment</h3>
            <AdjustCreditsForm organizationId={s.organizationId} keys={creditKeys} />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
