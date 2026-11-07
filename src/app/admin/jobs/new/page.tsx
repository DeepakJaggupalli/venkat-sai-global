import type { Metadata } from "next";
import { z } from "zod";

import { ActionForm, type AdminFieldSpec } from "@/components/admin/action-form";
import { listOrganizationOptions } from "@/components/admin/queries";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORK_MODES } from "@/db/schema/_constants";
import { fromMinorUnits, humanize } from "@/lib/format";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { saveStaffJobAction } from "@/modules/jobs/actions";
import { VISA_SPONSORSHIP_OPTIONS } from "@/modules/jobs/constants";
import { getRequirement } from "@/modules/operations/queries";
import { countryOptions, currencyOptions, industryOptions, jobCategoryOptions } from "@/modules/taxonomy/queries";

import { createJobFromRequirementLineAction } from "../actions";

export const metadata: Metadata = { title: "Create job" };

type SP = Record<string, string | string[] | undefined>;
const o = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));
const triOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

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
  const [employers, countries, currencies, industries, categories, requirement] = await Promise.all([
    listOrganizationOptions("employer"),
    countryOptions(),
    currencyOptions(),
    industryOptions(),
    jobCategoryOptions(),
    requirementId && staffCan(ctx, "requirements.view") ? getRequirement(ctx, requirementId) : Promise.resolve(null),
  ]);
  const line = requirement?.lines.find((l) => l.id === lineId) ?? null;
  // Opened from a role: the draft is linked to that role on save (needs the requirements permission too).
  const linkLine = line && staffCan(ctx, "requirements.manage") ? line : null;
  const money = (v: number | null | undefined) => (v != null && line?.salaryCurrency ? fromMinorUnits(v, line.salaryCurrency) : null);

  const fields: AdminFieldSpec[] = [
    { name: "title", label: "Job title", required: true, defaultValue: line?.roleTitle ?? null, wide: true },
    { name: "summary", label: "Summary", optional: true, hint: "One or two lines shown on job cards", wide: true },
    { name: "descriptionHtml", label: "Description", kind: "richtext", optional: true },
    {
      name: "organizationId",
      label: "Employer",
      kind: "search-select",
      options: employers,
      optional: true,
      allowClear: true,
      defaultValue: requirement?.requirement.organizationId ?? null,
      hint: "Leave empty for a Venkat Sai-managed job for an unregistered or confidential client",
    },
    { name: "employerReference", label: "Internal reference", optional: true },
    { name: "isConfidential", label: "Confidential client: candidates never see the employer's name, logo or page", kind: "checkbox", wide: true },
    { name: "confidentialEmployerName", label: "Employer description shown to candidates", optional: true, hint: "For example “EPC contractor, Qatar”. Required for confidential jobs and when no employer is chosen.", wide: true },
    { name: "managedByVenkatSai", label: "Venkat Sai manages this hiring (applications come to our team)", kind: "checkbox", defaultValue: !requirement?.requirement.organizationId, wide: true },
    { name: "jobCategoryId", label: "Category", kind: "search-select", options: categories, optional: true, allowClear: true, defaultValue: line?.jobCategoryId ?? null },
    { name: "industryId", label: "Industry", kind: "search-select", options: industries, optional: true, allowClear: true, defaultValue: requirement?.requirement.industryId ?? null },
    { name: "employmentType", label: "Employment type", kind: "select", options: o(EMPLOYMENT_TYPES), defaultValue: "full_time" },
    { name: "workMode", label: "Work mode", kind: "select", options: o(WORK_MODES), defaultValue: "on_site" },
    { name: "experienceLevel", label: "Experience level", kind: "select", options: o(EXPERIENCE_LEVELS), optional: true, allowClear: true },
    { name: "openings", label: "Openings", kind: "number", min: 1, defaultValue: line?.positions ?? 1 },
    { name: "experienceMinYears", label: "Minimum experience (years)", kind: "number", optional: true, min: 0, defaultValue: line?.experienceMinYears ?? null },
    { name: "experienceMaxYears", label: "Maximum experience (years)", kind: "number", optional: true, min: 0, defaultValue: line?.experienceMaxYears ?? null },
    { name: "countryCode", label: "Country", kind: "search-select", options: countries, optional: true, allowClear: true, defaultValue: requirement?.requirement.countryCode ?? null, hint: "Required unless the job is remote" },
    { name: "stateRegion", label: "State or region", optional: true },
    { name: "city", label: "City", optional: true },
    { name: "salaryMin", label: "Salary from", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: money(line?.salaryMinMinor) },
    { name: "salaryMax", label: "Salary to", kind: "number", optional: true, min: 0, step: "0.01", defaultValue: money(line?.salaryMaxMinor) },
    { name: "salaryCurrency", label: "Salary currency", kind: "search-select", options: currencies, optional: true, allowClear: true, defaultValue: line?.salaryCurrency ?? null },
    { name: "salaryPeriod", label: "Pay period", kind: "select", options: o(SALARY_PERIODS), optional: true, allowClear: true, defaultValue: line?.salaryPeriod ?? null },
    { name: "salaryVisible", label: "Show the salary to candidates", kind: "checkbox", defaultValue: true, wide: true },
    { name: "visaSponsorship", label: "Visa", kind: "select", options: o(VISA_SPONSORSHIP_OPTIONS), defaultValue: "not_applicable" },
    { name: "contractDurationMonths", label: "Contract length (months)", kind: "number", optional: true, min: 1, defaultValue: requirement?.requirement.contractDurationMonths ?? null },
    { name: "accommodationProvided", label: "Accommodation provided", kind: "select", options: triOptions, optional: true, allowClear: true, defaultValue: requirement?.requirement.accommodationProvided ? "yes" : null },
    { name: "foodProvided", label: "Food provided", kind: "select", options: triOptions, optional: true, allowClear: true, defaultValue: requirement?.requirement.foodProvided ? "yes" : null },
    { name: "transportProvided", label: "Transport provided", kind: "select", options: triOptions, optional: true, allowClear: true, defaultValue: requirement?.requirement.transportProvided ? "yes" : null },
    { name: "workingHours", label: "Working hours", optional: true, defaultValue: requirement?.requirement.workingHours ?? null },
    { name: "applicationDeadline", label: "Application deadline", kind: "date", optional: true },
    { name: "expiresAt", label: "Listing end date", kind: "date", optional: true, hint: "Defaults to the standard listing length after publication" },
    { name: "recruitmentProcess", label: "Selection process", kind: "textarea", optional: true, defaultValue: requirement?.requirement.interviewDetails ?? null },
  ];

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
        />
      </SectionCard>
    </div>
  );
}
