import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { PlanForm } from "../_components/plan-form";

export const metadata: Metadata = { title: "New plan" };

export default async function NewPlanPage() {
  await requireStaff("commercial.plans");
  return (
    <div className="space-y-6">
      <PageHeader
        title="New plan"
        description="Create the plan first; add prices and limits on the next screen."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Plans", href: `${ADMIN_COMMERCIAL}/plans` }, { label: "New plan" }]}
      />
      <SectionCard title="Plan details">
        <PlanForm canEdit />
      </SectionCard>
    </div>
  );
}
