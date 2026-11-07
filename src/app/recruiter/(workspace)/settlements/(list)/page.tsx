import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { labelOf, SETTLEMENT_STATUS } from "@/components/recruiter/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { listPartnerSettlements } from "@/modules/commercial/queries";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Settlements" };

export default async function RecruiterSettlementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.settlements.view");
  const params = await searchParams;
  const page = parsePage(params, { defaultSize: 20 });
  const result = await listPartnerSettlements(ctx, page);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settlements"
        description="Commission Venkat Sai owes your agency for placements credited to you, grouped by period and currency. Settlements appear once they are sent for approval."
      />
      <DataTable
        caption="Your settlements"
        rows={result.items}
        getRowId={(s) => s.id}
        rowLink={(s) => ({ href: `/recruiter/settlements/${s.id}`, label: `Open settlement ${s.code}` })}
        columns={[
          { id: "code", header: "Settlement", primary: true, cell: (s) => <span className="font-medium text-foreground">{s.code}</span> },
          {
            id: "period",
            header: "Period",
            cell: (s) => (
              <span>
                <DateText value={s.periodStart} dateOnly /> – <DateText value={s.periodEnd} dateOnly />
              </span>
            ),
          },
          { id: "amount", header: "Amount", align: "right", cell: (s) => <MoneyText amountMinor={s.amountMinor} currency={s.currency} tabular /> },
          { id: "net", header: "Net payable", align: "right", cell: (s) => <MoneyText amountMinor={s.netPayableMinor} currency={s.currency} tabular />, hideOnMobile: true },
          {
            id: "status",
            header: "Status",
            cell: (s) => {
              const st = labelOf(SETTLEMENT_STATUS, s.status);
              return (
                <StatusBadge tone={st.tone} size="sm">
                  {st.label}
                </StatusBadge>
              );
            },
          },
          { id: "paid", header: "Paid on", cell: (s) => (s.paidAt ? <DateText value={s.paidAt} /> : "—"), hideOnMobile: true },
        ]}
        empty={
          <EmptyState
            icon={<Wallet aria-hidden="true" />}
            title="No settlements yet"
            description="When a candidate you placed meets the conditions in your agreement, Venkat Sai prepares a settlement and it appears here."
            primaryAction={{ label: "View your agreement", href: "/recruiter/profile#agreement" }}
          />
        }
        footer={
          result.pageCount > 1 ? (
            <Pagination pathname="/recruiter/settlements" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="settlements" />
          ) : null
        }
      />
    </div>
  );
}
