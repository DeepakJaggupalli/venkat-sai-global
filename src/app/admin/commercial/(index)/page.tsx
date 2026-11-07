import type { Metadata } from "next";

import { AUDIENCE_LABELS, PROVIDER_LABELS } from "@/components/billing/labels";
import { monthStartIso } from "@/components/billing/plan-utils";
import { Callout } from "@/components/shared/callout";
import { BarChart } from "@/components/shared/charts";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { fromMinorUnits } from "@/lib/format";
import { getSellerDetails } from "@/modules/commercial/config";
import { listOrganizationsWithOutstanding, listPlansForAdmin } from "@/modules/commercial/queries";
import { activeSubscriptionsByPlan, outstandingInvoices, paymentsByProvider, revenueByMonth } from "@/modules/commercial/reports";
import { listTaxRates } from "@/modules/commercial/tax-rates";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { isFeatureEnabled } from "@/modules/settings";

import { ADMIN_COMMERCIAL } from "../_lib/nav";

export const metadata: Metadata = { title: "Revenue & billing" };

const MONTHS = 12;

/** Command Centre revenue overview. Every figure is grouped by currency and never summed across currencies. */
export default async function CommercialOverviewPage() {
  const staff = await requireStaff("commercial.view");
  const canReports = staffCan(staff, "commercial.reports");
  const now = new Date();
  const from = new Date(`${monthStartIso(now, MONTHS - 1)}T00:00:00Z`);
  const range = { from, to: now };

  const [revenue, outstanding, byPlan, byProvider, owing, plans, seller, rates, online] = await Promise.all([
    canReports ? revenueByMonth(staff, range) : Promise.resolve([]),
    outstandingInvoices(staff, now),
    activeSubscriptionsByPlan(staff),
    canReports ? paymentsByProvider(staff, range) : Promise.resolve([]),
    listOrganizationsWithOutstanding(staff),
    listPlansForAdmin(staff),
    getSellerDetails(),
    listTaxRates(staff),
    isFeatureEnabled("commercial.online_payments"),
  ]);

  const unconfirmed = rates.filter((r) => r.isActive && !r.confirmedAt).length;
  const months = Array.from({ length: MONTHS }, (_, i) => monthStartIso(now, MONTHS - 1 - i).slice(0, 7));
  const currencies = [...new Set(revenue.map((r) => r.currency))].sort();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Revenue & billing"
        description="Invoices, collections, subscriptions and receivables. Amounts are shown per currency and never added across currencies."
        actions={[
          ...(staffCan(staff, "commercial.invoices") ? [{ label: "New invoice", href: `${ADMIN_COMMERCIAL}/invoices/new` }] : []),
          ...(staffCan(staff, "commercial.payments") ? [{ label: "Record payment", href: `${ADMIN_COMMERCIAL}/payments/new`, variant: "outline" as const }] : []),
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Callout tone={seller.taxId ? "neutral" : "info"} title={seller.taxId ? `GST registered (${seller.taxId})` : "No GSTIN recorded"} action={{ label: "Seller details", href: `${ADMIN_COMMERCIAL}/seller` }}>
          {seller.taxId ? "Tax invoices charge GST by place of supply." : "Invoices are issued without GST until a GSTIN is entered."}
        </Callout>
        <Callout tone={unconfirmed ? "warning" : "success"} title={unconfirmed ? `${unconfirmed} tax rate${unconfirmed === 1 ? "" : "s"} to confirm` : "Tax rates confirmed"} action={{ label: "Tax rates", href: `${ADMIN_COMMERCIAL}/tax-rates` }}>
          {unconfirmed ? "Default rates must be checked with your tax adviser before use." : "Every active rate has been confirmed by finance."}
        </Callout>
        <Callout tone="neutral" title={online ? "Online payments on" : "Online payments off"}>
          {online ? "Razorpay / Stripe are offered where gateway keys are set. They have not been tested against live sandboxes." : "Invoices are paid offline (bank transfer, UPI, cheque) and recorded here."}
        </Callout>
      </div>

      {!plans.length ? (
        <Callout tone="info" title="No plans yet" action={{ label: "Create a plan", href: `${ADMIN_COMMERCIAL}/plans/new` }}>
          Portals show a &ldquo;Talk to our team&rdquo; message until a public plan with a price exists.
        </Callout>
      ) : null}

      {canReports ? (
        currencies.length ? (
          <div className="grid gap-6 xl:grid-cols-2">
            {currencies.map((currency) => {
              const data = months.map((month) => {
                const row = revenue.find((r) => r.currency === currency && r.month === month);
                return { month, invoiced: fromMinorUnits(row?.netInvoicedMinor ?? 0, currency), collected: fromMinorUnits(row?.collectedMinor ?? 0, currency) };
              });
              return (
                <SectionCard key={currency} title={`Revenue by month · ${currency}`} description="Net invoiced (after credit notes, incl. tax) and collected, last 12 months.">
                  <BarChart
                    title={`Revenue by month in ${currency}`}
                    index="month"
                    indexLabel="Month"
                    xFormat="month"
                    data={data}
                    series={[
                      { key: "invoiced", label: "Net invoiced" },
                      { key: "collected", label: "Collected" },
                    ]}
                    numberFormat={{ style: "currency", currency, maximumFractionDigits: 0 }}
                  />
                </SectionCard>
              );
            })}
          </div>
        ) : (
          <SectionCard title="Revenue by month">
            <EmptyState title="No revenue in the last 12 months" description="Issued invoices and recorded payments appear here by month and currency." size="sm" variant="plain" />
          </SectionCard>
        )
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Outstanding invoices" description="Receivables by days past due." flush action={{ label: "Open invoices", href: `${ADMIN_COMMERCIAL}/invoices?status=open` }}>
          <DataTable
            caption="Outstanding invoices by currency"
            rows={outstanding}
            getRowId={(r) => r.currency}
            columns={[
              { id: "currency", header: "Currency", primary: true, cell: (r) => <span className="font-medium">{r.currency}</span> },
              { id: "count", header: "Invoices", align: "right", cell: (r) => r.invoices },
              { id: "total", header: "Outstanding", align: "right", nowrap: true, cell: (r) => <MoneyText amountMinor={r.outstandingMinor} currency={r.currency} /> },
              { id: "current", header: "Not yet due", align: "right", hideOnMobile: true, nowrap: true, cell: (r) => <MoneyText amountMinor={r.currentMinor} currency={r.currency} /> },
              { id: "30", header: "1–30 days", align: "right", hideOnMobile: true, nowrap: true, cell: (r) => <MoneyText amountMinor={r.overdue1to30Minor} currency={r.currency} /> },
              { id: "60", header: "31–60", align: "right", hideOnMobile: true, nowrap: true, cell: (r) => <MoneyText amountMinor={r.overdue31to60Minor} currency={r.currency} /> },
              { id: "90", header: "61–90", align: "right", hideOnMobile: true, nowrap: true, cell: (r) => <MoneyText amountMinor={r.overdue61to90Minor} currency={r.currency} /> },
              { id: "90+", header: "Over 90", align: "right", hideOnMobile: true, nowrap: true, cell: (r) => <MoneyText amountMinor={r.overdueOver90Minor} currency={r.currency} /> },
            ]}
            empty={<EmptyState title="Nothing outstanding" description="Every issued invoice is paid." size="sm" variant="plain" />}
          />
        </SectionCard>

        <SectionCard title="Who owes" flush>
          <DataTable
            caption="Organisations with outstanding invoices"
            rows={owing.slice(0, 10)}
            getRowId={(r) => `${r.organizationId}-${r.currency}`}
            rowLink={(r) => ({ href: `${ADMIN_COMMERCIAL}/invoices?status=open&org=${r.organizationId}`, label: `Open invoices of ${r.organizationName}` })}
            columns={[
              { id: "org", header: "Organisation", primary: true, cell: (r) => r.organizationName },
              { id: "count", header: "Invoices", align: "right", cell: (r) => r.invoices },
              { id: "amount", header: "Outstanding", align: "right", nowrap: true, cell: (r) => <MoneyText amountMinor={r.outstandingMinor} currency={r.currency} /> },
            ]}
            empty={<EmptyState title="Nobody owes anything" size="sm" variant="plain" />}
          />
        </SectionCard>
      </div>

      <SectionCard title="Active subscriptions by plan" flush action={{ label: "Subscriptions", href: `${ADMIN_COMMERCIAL}/subscriptions` }}>
        <DataTable
          caption="Live subscriptions per plan"
          rows={byPlan}
          getRowId={(r) => r.planId}
          rowLink={(r) => ({ href: `${ADMIN_COMMERCIAL}/subscriptions?plan=${r.planId}`, label: `Subscriptions on ${r.planName}` })}
          columns={[
            { id: "plan", header: "Plan", primary: true, cell: (r) => <span className="font-medium">{r.planName}</span> },
            { id: "audience", header: "Audience", hideOnMobile: true, cell: (r) => AUDIENCE_LABELS[r.audience as keyof typeof AUDIENCE_LABELS] ?? r.audience },
            { id: "trialing", header: "Trial", align: "right", cell: (r) => r.trialing },
            { id: "active", header: "Active", align: "right", cell: (r) => r.active },
            { id: "pastDue", header: "Past due", align: "right", cell: (r) => r.pastDue },
            {
              id: "mrr",
              header: "Monthly recurring",
              align: "right",
              cell: (r) =>
                r.monthlyRecurring.length ? (
                  <ul>
                    {r.monthlyRecurring.map((m) => (
                      <li key={m.currency}>
                        <MoneyText amountMinor={m.amountMinor} currency={m.currency} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                ),
            },
          ]}
          empty={<EmptyState title="No live subscriptions" description="Subscriptions appear here once organisations start a plan." size="sm" variant="plain" />}
        />
      </SectionCard>

      {canReports ? (
        <SectionCard title="Payments by provider" description="Last 12 months." flush>
          <DataTable
            caption="Payments by provider and currency"
            rows={byProvider}
            getRowId={(r) => `${r.provider}-${r.currency}`}
            columns={[
              { id: "provider", header: "Provider", primary: true, cell: (r) => PROVIDER_LABELS[r.provider as keyof typeof PROVIDER_LABELS] ?? r.provider },
              { id: "currency", header: "Currency", cell: (r) => r.currency },
              { id: "count", header: "Payments", align: "right", cell: (r) => r.payments },
              { id: "amount", header: "Received", align: "right", nowrap: true, cell: (r) => <MoneyText amountMinor={r.amountMinor} currency={r.currency} /> },
              { id: "refunded", header: "Refunded", align: "right", hideOnMobile: true, nowrap: true, cell: (r) => <MoneyText amountMinor={r.refundedMinor} currency={r.currency} /> },
              { id: "failed", header: "Failed", align: "right", hideOnMobile: true, cell: (r) => r.failed },
            ]}
            empty={<EmptyState title="No payments in the last 12 months" size="sm" variant="plain" />}
          />
        </SectionCard>
      ) : (
        <p className="text-sm text-muted-foreground">Revenue charts and provider totals need the &ldquo;View revenue reports&rdquo; permission.</p>
      )}
    </div>
  );
}
