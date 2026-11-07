import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff } from "@/modules/identity/authz";
import { countryOptions } from "@/modules/taxonomy/queries";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { TaxRateForm } from "../_components/tax-rate-form";

export const metadata: Metadata = { title: "New tax rate" };

export default async function NewTaxRatePage() {
  await requireStaff("commercial.plans");
  const countries = await countryOptions();
  return (
    <div className="space-y-6">
      <PageHeader title="New tax rate" description="New rates start unconfirmed until finance confirms them." breadcrumbs={[COMMERCIAL_CRUMB, { label: "Tax rates", href: `${ADMIN_COMMERCIAL}/tax-rates` }, { label: "New" }]} />
      <SectionCard title="Tax rate">
        <TaxRateForm countries={countries} canEdit />
      </SectionCard>
    </div>
  );
}
