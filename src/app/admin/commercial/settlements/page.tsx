import type { Metadata } from "next";
import { z } from "zod";

import { BillingStatusBadge } from "@/components/billing/billing-status";
import { OPTIONS } from "@/components/billing/labels";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { parsePage } from "@/lib/http";
import { SETTLEMENT_STATUS_OPTIONS } from "@/modules/commercial/constants";
import { listSettlements } from "@/modules/commercial/queries";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";
import { listOrganizationOptions } from "../_lib/queries";
import { ComputeSettlementForm } from "./_components/settlement-forms";

export const metadata: Metadata = { title: "Partner settlements" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const filtersSchema = z.object({
  status: z.enum(SETTLEMENT_STATUS_OPTIONS).optional().catch(undefined),
  partnerOrganizationId: z.uuid().optional().catch(undefined),
});

export default async function SettlementsPage({ searchParams }: PageProps) {
  const staff = await requireStaff("partners.settlements");
  const sp = await searchParams;
  const filters = filtersSchema.parse({ status: sp.status, partnerOrganizationId: sp.partner });
  const [result, partners] = await Promise.all([listSettlements(staff, filters, parsePage(sp)), listOrganizationOptions(staff, ["recruitment_partner"])]);
  const pathname = `${ADMIN_COMMERCIAL}/settlements`;
  const partnerOptions = partners.map((p) => ({ value: p.value, label: p.label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner settlements"
        description="Placement fees owed to recruitment partners, per period and currency. Settlements are approved before they are paid."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Partner settlements" }]}
      />
      <SectionCard title="Generate settlements" description="Includes every unsettled fee payable by the end of the period, so earlier periods are caught up.">
        <ComputeSettlementForm partners={partnerOptions} />
      </SectionCard>
      <SectionCard title="Settlements" flush>
        <div className="p-4 sm:p-5">
          <FilterBar paramKeys={["status", "partner"]}>
            <FilterSelect param="status" label="Status" allLabel="All statuses" options={OPTIONS.settlementStatus} />
            <FilterSelect param="partner" label="Partner" allLabel="All partners" options={partnerOptions} />
          </FilterBar>
        </div>
        <DataTable
          caption="Partner settlements"
          rows={result.items}
          getRowId={(s) => s.id}
          rowLink={(s) => ({ href: `${pathname}/${s.id}`, label: `Open settlement ${s.code}` })}
          columns={[
            { id: "code", header: "Settlement", primary: true, cell: (s) => <span className="font-medium">{s.code}</span> },
            { id: "partner", header: "Partner", cell: (s) => s.partnerName },
            { id: "period", header: "Period", hideOnMobile: true, cell: (s) => `${s.periodStart} – ${s.periodEnd}` },
            { id: "net", header: "Net payable", align: "right", nowrap: true, cell: (s) => <MoneyText amountMinor={s.netPayableMinor} currency={s.currency} /> },
            { id: "status", header: "Status", cell: (s) => <BillingStatusBadge kind="settlement" status={s.status} /> },
          ]}
          empty={<EmptyState title="No settlements" description="Generate a settlement for a partner and period above." size="sm" variant="plain" />}
          footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="settlements" />}
        />
      </SectionCard>
    </div>
  );
}
