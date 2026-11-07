import type { Metadata } from "next";

import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { openJobOptions, partnerOptions, requirementOptions } from "../../pipeline/_shared/options";
import { isUuid } from "../../pipeline/_shared/server";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { createAssignmentFormAction } from "../actions";

export const metadata: Metadata = { title: "New assignment · Partners" };

export default async function NewPartnerAssignmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff("partners.assign");
  const params = await searchParams;
  const requirementParam = sp(params, "requirement");
  const partnerParam = sp(params, "partner");
  const [partners, requirements, jobs, currencies] = await Promise.all([partnerOptions({ verifiedOnly: true }), requirementOptions(), openJobOptions(), currencyOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New partner assignment"
        description="Give a verified recruitment partner a requirement or a job to source for. The partner is notified."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners", href: "/admin/partners" }, { label: "New assignment" }]}
      />
      <Callout tone="info" title="Compliance">
        Overseas assignments to a partner without a verified recruiting-agent licence raise a warning and are audited. Candidates are never charged by partners for being submitted.
      </Callout>
      <SectionCard title="Assignment">
        <StaffForm
          action={createAssignmentFormAction}
          columns={2}
          submitLabel="Create assignment"
          successHref="/admin/partners/{id}"
          testId="assignment-form"
          fields={[
            { name: "partnerOrganizationId", label: "Partner", kind: "search-select", required: true, options: partners, defaultValue: isUuid(partnerParam) ? partnerParam : null, hint: "Verified partners only.", wide: true },
            { name: "requirementId", label: "Requirement", kind: "search-select", optional: true, options: requirements, defaultValue: isUuid(requirementParam) ? requirementParam : null, allowClear: true },
            { name: "jobId", label: "Or a single job", kind: "search-select", optional: true, options: jobs, allowClear: true },
            { name: "positionsTarget", label: "Positions target", kind: "number", optional: true, min: 1 },
            { name: "submissionLimit", label: "Submission limit", kind: "number", optional: true, min: 1 },
            { name: "dueDate", label: "Due date", kind: "date", optional: true },
            { name: "instructions", label: "Instructions for the partner", kind: "textarea", optional: true, rows: 3, maxLength: 4000 },
            { name: "internalNotes", label: "Internal notes", kind: "textarea", optional: true, rows: 2, hint: "Staff only.", maxLength: 4000 },
            { name: "commissionModel", label: "Commission model", kind: "select", optional: true, options: [{ value: "fixed_per_placement", label: "Fixed per placement" }, { value: "percent_of_fee", label: "Percent of placement fee" }, { value: "custom", label: "Custom" }, { value: "none", label: "None" }], allowClear: true },
            { name: "commissionCurrency", label: "Commission currency", kind: "search-select", optional: true, options: currencies, allowClear: true },
            { name: "commissionAmount", label: "Fixed amount", kind: "number", optional: true, min: 0, step: "0.01" },
            { name: "commissionPercent", label: "Percent of fee", kind: "number", optional: true, min: 0, max: 100, step: "0.01" },
            { name: "payableAfterDays", label: "Payable after joining (days)", kind: "number", optional: true, min: 0, max: 365 },
            { name: "commissionNotes", label: "Commission notes", optional: true, maxLength: 2000 },
          ]}
        />
      </SectionCard>
    </div>
  );
}
