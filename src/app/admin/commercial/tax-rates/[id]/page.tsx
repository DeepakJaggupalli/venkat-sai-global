import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { countryOptions } from "@/modules/taxonomy/queries";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { getTaxRate } from "../../_lib/queries";
import { ConfirmTaxRateButton, TaxRateForm } from "../_components/tax-rate-form";

export const metadata: Metadata = { title: "Tax rate" };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function TaxRatePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("commercial.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [rate, countries] = await Promise.all([getTaxRate(staff, id), countryOptions()]);
  if (!rate) notFound();
  const canEdit = staffCan(staff, "commercial.plans");
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;

  return (
    <div className="space-y-6">
      <PageHeader
        title={rate.name}
        status={rate.confirmedAt ? <StatusBadge tone="success">Confirmed</StatusBadge> : <StatusBadge tone="warning">Unconfirmed – check with your tax adviser</StatusBadge>}
        meta={rate.confirmedAt ? <span className="text-sm text-muted-foreground">Confirmed <DateText value={rate.confirmedAt} timeZone={timeZone} /></span> : undefined}
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Tax rates", href: `${ADMIN_COMMERCIAL}/tax-rates` }, { label: rate.name }]}
        actions={canEdit && rate.isActive && !rate.confirmedAt ? [<ConfirmTaxRateButton key="confirm" taxRateId={rate.id} label={rate.name} />] : []}
      />
      <SectionCard title="Rate">
        <TaxRateForm
          canEdit={canEdit}
          countries={countries}
          rate={{
            id: rate.id,
            name: rate.name,
            countryCode: rate.countryCode,
            region: rate.region,
            kind: rate.kind,
            ratePercent: String(rate.rateBasisPoints / 100),
            taxCode: rate.taxCode,
            isActive: rate.isActive,
            effectiveFrom: iso(rate.effectiveFrom)!,
            effectiveUntil: iso(rate.effectiveUntil),
            notes: rate.notes,
          }}
        />
      </SectionCard>
    </div>
  );
}
