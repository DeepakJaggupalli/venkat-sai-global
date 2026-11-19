import type { Metadata } from "next";
import { z } from "zod";

import { ActionForm } from "@/components/admin/action-form";
import { listOrganizationOptions } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { fromMinorUnits } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { saveStaffJobAction } from "@/modules/jobs/actions";
import { getRequirement } from "@/modules/operations/queries";
import { countryOptions, currencyOptions, industryOptions, jobCategoryOptions, listEducationLevels } from "@/modules/taxonomy/queries";

import { createJobFromRequirementLineAction } from "../actions";
import { staffJobFields } from "../_lib/job-form-fields";
import { StaffJobListEditors } from "../_lib/job-list-editors";

export const metadata: Metadata = { title: "Create job" };

type SP = Record<string, string | string[] | undefined>;

/**
 * Staff job creation: an employer's job, a Venkat Sai-managed job, or a confidential-client job whose
 * employer is described but never named to candidates. Saved as a draft; publish from the job page.
 * `?requirement=&line=` prefills from a workforce requirement role.
 */
export default async function NewAdminJobPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("jobs.manage");
  const sp = await searchParams;
  const requirementId = z.uuid().safeParse(sp.requirement).data;
  const lineId = z.uuid().safeParse(sp.line).data;
  const [employers, countries, currencies, industries, categories, education, requirement] = await Promise.all([
    listOrganizationOptions("employer"),
    countryOptions(),
    currencyOptions(),
    industryOptions(),
    jobCategoryOptions(),
    listEducationLevels(),
    requirementId && staffCan(ctx, "requirements.view") ? getRequirement(ctx, requirementId) : Promise.resolve(null),
  ]);
  const line = requirement?.lines.find((l) => l.id === lineId) ?? null;
  // Opened from a role: the draft is linked to that role on save (needs the requirements permission too).
  const linkLine = line && staffCan(ctx, "requirements.manage") ? line : null;
  const money = (v: number | null | undefined) => (v != null && line?.salaryCurrency ? fromMinorUnits(v, line.salaryCurrency) : null);

  const fields = staffJobFields(
    {
      title: line?.roleTitle ?? null,
      organizationId: requirement?.requirement.organizationId ?? null,
      managedByVenkatSai: !requirement?.requirement.organizationId,
      jobCategoryId: line?.jobCategoryId ?? null,
      industryId: requirement?.requirement.industryId ?? null,
      openings: line?.positions ?? 1,
      experienceMinYears: line?.experienceMinYears ?? null,
      experienceMaxYears: line?.experienceMaxYears ?? null,
      countryCode: requirement?.requirement.countryCode ?? null,
      salaryMin: money(line?.salaryMinMinor),
      salaryMax: money(line?.salaryMaxMinor),
      salaryCurrency: line?.salaryCurrency ?? null,
      salaryPeriod: line?.salaryPeriod ?? null,
      salaryVisible: true,
      contractDurationMonths: requirement?.requirement.contractDurationMonths ?? null,
      accommodationProvided: requirement?.requirement.accommodationProvided ? "yes" : null,
      foodProvided: requirement?.requirement.foodProvided ? "yes" : null,
      transportProvided: requirement?.requirement.transportProvided ? "yes" : null,
      workingHours: requirement?.requirement.workingHours ?? null,
      recruitmentProcess: requirement?.requirement.interviewDetails ?? null,
    },
    { employers, countries, currencies, industries, categories, educationLevels: education.map((e) => ({ value: e.id, label: e.name })) },
    "create",
  );

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Jobs", href: "/admin/jobs" }, { label: "Create job" }]} />
      <PageHeader
        title="Create a job"
        description="Saved as a draft. Review it, record the recruiting-agent licence for overseas roles, then publish from the job page."
        backLink={{ href: requirement ? `/admin/requirements/${requirement.requirement.id}` : "/admin/jobs", label: requirement ? "Back to the requirement" : "Back to jobs" }}
      />
      {requirement ? (
        <Callout tone="info" title={`From ${requirement.requirement.code}`}>
          Prefilled from {line ? `the role “${line.roleTitle}” of ` : ""}“{requirement.requirement.title}”.{" "}
          {linkLine ? "Saving links the new job to this role." : "Link the new job to the role from the requirement page."}
        </Callout>
      ) : null}
      <Callout tone="neutral" title="Candidates are never charged">
        Do not mention fees for applying, interviews or trade tests in the job text. The employer or Venkat Sai pays for recruitment.
      </Callout>
      <SectionCard title="Job details">
        <ActionForm
          action={linkLine ? createJobFromRequirementLineAction : saveStaffJobAction}
          hidden={{ requirementId: requirement?.requirement.id, requirementLineId: linkLine?.id }}
          columns={2}
          fields={fields}
          submitLabel="Save draft"
          pendingLabel="Saving…"
          successHref="/admin/jobs/{id}"
          testId="admin-job-form"
        >
          <StaffJobListEditors skills={[]} locations={[]} screeningQuestions={[]} screeningRequired={false} countries={countries} />
        </ActionForm>
      </SectionCard>
    </div>
  );
}
