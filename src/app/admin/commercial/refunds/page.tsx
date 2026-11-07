import type { Metadata } from "next";
import { z } from "zod";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { OPTIONS, PROVIDER_LABELS } from "@/components/billing/labels";
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
import { REFUND_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listRefunds } from "@/modules/commercial/queries";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";

export const metadata: Metadata = { title: "Refunds" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RefundsPage({ searchParams }: PageProps) {
  const staff = await requireStaff("commercial.view");
  const sp = await searchParams;
  const status = z.enum(REFUND_STATUS_OPTIONS).optional().catch(undefined).parse(sp.status);
  const result = await listRefunds(staff, { status }, parsePage(sp));
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const pathname = `${ADMIN_COMMERCIAL}/refunds`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds"
        description="Refund requests are approved by a second person. Request a refund from a payment on the Payments page."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Refunds" }]}
      />
      <SectionCard title="Refund queue" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["status"]}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.refundStatus} />
          </FilterBar>
        </div>
        <DataTable
          caption="Refunds"
          rows={result.items}
          getRowId={(r) => r.id}
          rowLink={(r) => ({ href: `${pathname}/${r.id}`, label: `Open refund ${r.code}` })}
          columns={[
            { id: "code", header: "Refund", primary: true, cell: (r) => <span className="font-medium">{r.code}</span> },
            { id: "org", header: "Customer", cell: (r) => r.organizationName ?? "Individual" },
            { id: "payment", header: "Payment", hideOnMobile: true, cell: (r) => `${r.paymentCode} · ${PROVIDER_LABELS[r.provider]}` },
            { id: "amount", header: "Amount", align: "right", nowrap: true, cell: (r) => <MoneyText amountMinor={r.amountMinor} currency={r.currency} /> },
            { id: "date", header: "Requested", hideOnMobile: true, cell: (r) => <DateText value={r.createdAt} timeZone={timeZone} /> },
            { id: "status", header: "Status", cell: (r) => <BillingStatusBadge kind="refund" status={r.status} /> },
          ]}
          empty={<EmptyState title="No refunds" description="Refund requests appear here." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="refunds" />}
        />
      </SectionCard>
    </div>
  );
}
