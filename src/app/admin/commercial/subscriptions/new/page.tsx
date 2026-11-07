import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { listPlansForAdmin } from "@/modules/commercial/queries";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { listOrganizationOptions } from "../../_lib/queries";
import { StartSubscriptionForm } from "../_components/subscription-forms";

export const metadata: Metadata = { title: "New subscription" };

export default async function NewSubscriptionPage() {
  const staff = await requireStaff("commercial.invoices");
  const [orgs, plans] = await Promise.all([listOrganizationOptions(staff), listPlansForAdmin(staff)]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="New subscription"
        description="Put an organisation on a plan. Paid prices create the first invoice; the plan starts when it is paid."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Subscriptions", href: `${ADMIN_COMMERCIAL}/subscriptions` }, { label: "New" }]}
      />
      <SectionCard title="Subscription">
        <StartSubscriptionForm
          organizations={orgs.map((o) => ({ value: o.value, label: o.label, description: o.type === "recruitment_partner" ? "Recruitment partner" : o.type === "institution" ? "Institution" : "Employer" }))}
          plans={plans.filter((p) => p.kind === "base" || p.prices.some((x) => x.interval !== "one_time"))}
        />
      </SectionCard>
    </div>
  );
}
