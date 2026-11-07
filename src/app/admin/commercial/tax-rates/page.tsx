import type { Metadata } from "next";

import { TAX_KIND_OPTION_LABELS } from "@/components/billing/labels";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { formatRate } from "@/modules/commercial/tax";
import { listTaxRates, type TaxRateRow } from "@/modules/commercial/tax-rates";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../_lib/nav";
import { ConfirmTaxRateButton } from "./_components/tax-rate-form";

export const metadata: Metadata = { title: "Tax rates" };

export default async function TaxRatesPage() {
  const staff = await requireStaff("commercial.view");
  const rates = await listTaxRates(staff);
  const canEdit = staffCan(staff, "commercial.plans");
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const unconfirmed = rates.filter((r) => r.isActive && !r.confirmedAt).length;
  const pathname = `${ADMIN_COMMERCIAL}/tax-rates`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax rates"
        description="GST, VAT and sales tax rates with effective dates. Invoices pick the rate in force on the invoice date."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Tax rates" }]}
        actions={canEdit ? [{ label: "New tax rate", href: `${pathname}/new` }] : []}
      />
      {unconfirmed ? (
        <Callout tone="warning" title="Rates waiting for confirmation">
          The system was set up with default India GST rates for SAC 9985. They are a starting point, not tax advice. Check each rate with your tax adviser, then confirm it.
        </Callout>
      ) : null}
      <SectionCard title="All rates" flush>
        <DataTable
          caption="Tax rates"
          rows={rates}
          getRowId={(r) => r.id}
          rowLink={(r) => ({ href: `${pathname}/${r.id}`, label: `Open ${r.name}` })}
          columns={[
            { id: "name", header: "Name", primary: true, cell: (r) => <span className="font-medium">{r.name}<span className="block text-xs font-normal text-muted-foreground">{TAX_KIND_OPTION_LABELS[r.kind]}</span></span> },
            { id: "country", header: "Where", cell: (r) => `${r.countryCode}${r.region ? ` · ${r.region}` : ""}` },
            { id: "rate", header: "Rate", align: "right", cell: (r) => formatRate(r.rateBasisPoints) },
            { id: "code", header: "SAC / HSN", hideOnMobile: true, cell: (r) => r.taxCode ?? "Any" },
            { id: "dates", header: "Effective", hideOnMobile: true, cell: (r) => <span><DateText value={r.effectiveFrom} timeZone={timeZone} /> – {r.effectiveUntil ? <DateText value={r.effectiveUntil} timeZone={timeZone} /> : "no end"}</span> },
            {
              id: "status",
              header: "Status",
              cell: (r: TaxRateRow) => (
                <span className="flex flex-wrap items-center gap-1">
                  {!r.isActive ? (
                    <StatusBadge tone="neutral" size="sm">Inactive</StatusBadge>
                  ) : r.confirmedAt ? (
                    <StatusBadge tone="success" size="sm">Confirmed</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning" size="sm">Unconfirmed – check with your tax adviser</StatusBadge>
                  )}
                </span>
              ),
            },
            ...(canEdit ? [{ id: "actions", header: <span className="sr-only">Actions</span>, align: "right" as const, cell: (r: TaxRateRow) => (r.isActive && !r.confirmedAt ? <ConfirmTaxRateButton taxRateId={r.id} label={`${r.name} ${formatRate(r.rateBasisPoints)}`} /> : null) }] : []),
          ]}
          empty={<EmptyState title="No tax rates" description="Without rates, invoices are issued without tax and list the missing rate as a problem." size="sm" variant="plain" />}
        />
      </SectionCard>
    </div>
  );
}
