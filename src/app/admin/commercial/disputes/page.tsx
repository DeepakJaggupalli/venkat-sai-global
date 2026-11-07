import type { Metadata } from "next";
import { z } from "zod";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { OPTIONS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { env } from "@/lib/env";
import { parsePage } from "@/lib/http";
import { DISPUTE_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listDisputes } from "@/modules/commercial/queries";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";

export const metadata: Metadata = { title: "Disputes" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DisputesPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const status = z.enum(DISPUTE_STATUS_OPTIONS).optional().catch(undefined).parse(sp.status);
  const result = await listDisputes(staff, { status }, parsePage(sp));
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const pathname = `${ADMIN_COMMERCIAL}/disputes`;

  return (
    <div className="space-y-6">
      <PageHeader title="Disputes" description="Billing queries raised by customers and chargebacks recorded by finance." breadcrumbs={[COMMERCIAL_CRUMB, { label: "Disputes" }]} />
      <SectionCard title="Dispute queue" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["status"]}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.disputeStatus} />
          </FilterBar>
        </div>
        <DataTable
          caption="Disputes"
          rows={result.items}
          getRowId={(d) => d.id}
          rowLink={(d) => ({ href: `${pathname}/${d.id}`, label: `Open dispute from ${d.organizationName ?? "customer"}` })}
          columns={[
            { id: "org", header: "Customer", primary: true, cell: (d) => <span className="font-medium">{d.organizationName ?? "Individual"}</span> },
            { id: "source", header: "Source", hideOnMobile: true, cell: (d) => (d.source === "chargeback" ? "Chargeback" : "Customer query") },
            { id: "invoice", header: "Invoice", cell: (d) => d.invoiceCode ?? "—" },
            { id: "amount", header: "Amount", align: "right", nowrap: true, cell: (d) => (d.amountMinor !== null && d.currency ? <MoneyText amountMinor={d.amountMinor} currency={d.currency} /> : "Whole document") },
            { id: "date", header: "Opened", hideOnMobile: true, cell: (d) => <DateText value={d.createdAt} timeZone={timeZone} /> },
            { id: "status", header: "Status", cell: (d) => <BillingStatusBadge kind="dispute" status={d.status} /> },
          ]}
          empty={<EmptyState title="No disputes" description="Billing queries from customers appear here." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="disputes" />}
        />
      </SectionCard>
    </div>
  );
}
