import type { Metadata } from "next";

import { RequirementForm } from "@/components/employer/requirement-form";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrgMember } from "@/modules/identity/authz";

import { loadRequirementFormOptions, loadRequirementSubmitBlock } from "../_lib/form-data";

export const metadata: Metadata = { title: "New workforce requirement" };

export default async function NewRequirementPage() {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  const [{ options, defaultCurrency }, submitBlockedReason] = await Promise.all([loadRequirementFormOptions(ctx), loadRequirementSubmitBlock(ctx)]);
  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Workforce requirements", href: "/employer/requirements" }, { label: "New requirement" }]} />
      <PageHeader
        title="New workforce requirement"
        description="List every trade you need. Save a draft at any time; submit when it is ready and Venkat Sai will review it and get back to you."
        backLink={{ href: "/employer/requirements", label: "Back to requirements" }}
      />
      <RequirementForm organizationId={ctx.organization.id} defaults={{}} attachments={[]} options={options} defaultCurrency={defaultCurrency} submitBlockedReason={submitBlockedReason} />
    </div>
  );
}
