import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RequirementForm } from "@/components/employer/requirement-form";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrgMember } from "@/modules/identity/authz";
import { getOrgRequirement } from "@/modules/operations/queries";

import { loadRequirementAttachments, loadRequirementFormOptions, loadRequirementSubmitBlock, requirementFormDefaults } from "../../_lib/form-data";

export const metadata: Metadata = { title: "Edit requirement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const requirement = await getOrgRequirement(ctx, id);
  if (!requirement) notFound();
  // Only drafts are editable (submitted requirements are changed through Venkat Sai).
  if (requirement.status !== "draft") redirect(`/employer/requirements/${id}`);
  const [{ options, defaultCurrency }, submitBlockedReason, attachments] = await Promise.all([
    loadRequirementFormOptions(ctx),
    loadRequirementSubmitBlock(ctx),
    loadRequirementAttachments(ctx, requirement.attachmentFileIds),
  ]);
  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Workforce requirements", href: "/employer/requirements" }, { label: requirement.title, href: `/employer/requirements/${id}` }, { label: "Edit" }]} />
      <PageHeader title={`Edit ${requirement.title}`} eyebrow={requirement.code} backLink={{ href: `/employer/requirements/${id}`, label: "Back to requirement" }} />
      {requirement.statusReason ? (
        <Callout tone="warning" title="Venkat Sai asked for changes">
          {requirement.statusReason}
        </Callout>
      ) : null}
      <RequirementForm
        requirementId={id}
        organizationId={ctx.organization.id}
        defaults={requirementFormDefaults(requirement)}
        attachments={attachments}
        options={options}
        defaultCurrency={defaultCurrency}
        submitBlockedReason={submitBlockedReason}
      />
    </div>
  );
}
