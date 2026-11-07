import type { Metadata } from "next";
import { z } from "zod";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { INTERVAL_SUFFIX, OPTIONS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { parsePage } from "@/lib/http";
import { SUBSCRIPTION_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listPlansForAdmin, listSubscriptions } from "@/modules/commercial/queries";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";

export const metadata: Metadata = { title: "Subscriptions" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const filtersSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUS_OPTIONS).optional().catch(undefined),
  planId: z.uuid().optional().catch(undefined),
  organizationId: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export default async function SubscriptionsPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const filters = filtersSchema.parse({ status: sp.status, planId: sp.plan, organizationId: sp.org, q: sp.q || undefined });
  const [result, plans] = await Promise.all([listSubscriptions(staff, filters, parsePage(sp)), listPlansForAdmin(staff)]);
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const pathname = `${ADMIN_COMMERCIAL}/subscriptions`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Every organisation's plans, periods and renewal status."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Subscriptions" }]}
        actions={staffCan(staff, "commercial.invoices") ? [{ label: "New subscription", href: `${pathname}/new` }] : []}
      />
      <SectionCard title="All subscriptions" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["q", "status", "plan", "org"]} search={<SearchInput label="Search organisations" />}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.subscriptionStatus} />
            <FilterSelect param="plan" label="Plan" allLabel="All plans" options={plans.map((p) => ({ value: p.id, label: p.name }))} />
          </FilterBar>
        </div>
        <DataTable
          caption="Subscriptions"
          rows={result.items}
          getRowId={(s) => s.id}
          rowLink={(s) => ({ href: `${pathname}/${s.id}`, label: `Open ${s.organizationName} — ${s.planName}` })}
          columns={[
            { id: "org", header: "Organisation", primary: true, cell: (s) => <span className="font-medium">{s.organizationName}</span> },
            { id: "plan", header: "Plan", cell: (s) => `${s.planName}${s.kind === "add_on" ? " (add-on)" : ""}` },
            {
              id: "price",
              header: "Price",
              align: "right",
              nowrap: true,
              cell: (s) =>
                s.amountMinor !== null && s.currency && s.interval ? (
                  <span>
                    <MoneyText amountMinor={s.amountMinor} currency={s.currency} />
                    <span className="block text-xs text-muted-foreground">{INTERVAL_SUFFIX[s.interval]}</span>
                  </span>
                ) : (
                  "Contract"
                ),
            },
            { id: "period", header: "Period ends", hideOnMobile: true, cell: (s) => (s.currentPeriodEnd ? <DateText value={s.currentPeriodEnd} timeZone={timeZone} /> : "—") },
            {
              id: "status",
              header: "Status",
              cell: (s) => (
                <span>
                  <BillingStatusBadge kind="subscription" status={s.status} />
                  {s.cancelAtPeriodEnd ? <span className="mt-1 block text-xs text-muted-foreground">Ends at period end</span> : null}
                </span>
              ),
            },
          ]}
          empty={<EmptyState title="No subscriptions match" description="Try other filters, or create a subscription for an organisation." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="subscriptions" />}
        />
      </SectionCard>
    </div>
  );
}
