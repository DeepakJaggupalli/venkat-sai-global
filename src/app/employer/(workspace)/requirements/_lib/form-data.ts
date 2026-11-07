import "server-only";

import type { RequirementFormDefaults } from "@/components/employer/requirement-form";
import { fromMinorUnits } from "@/lib/format";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { getFiles } from "@/modules/files";
import { toFileSummary } from "@/modules/files/present";
import type { FileSummary } from "@/modules/files/types";
import type { OrgContext } from "@/modules/identity/authz";
import type { EmployerRequirementView } from "@/modules/operations/types";
import { getCompanyProfile } from "@/modules/organizations/employer";
import { countryOptions, currencyOptions, industryOptions, jobCategoryOptions } from "@/modules/taxonomy/queries";

export async function loadRequirementFormOptions(ctx: OrgContext<"employer">) {
  const [countries, industries, categories, currencies, profile] = await Promise.all([
    countryOptions(),
    industryOptions(),
    jobCategoryOptions(),
    currencyOptions(),
    getCompanyProfile(ctx, ctx.organization.id).catch(() => null),
  ]);
  return { options: { countries, industries, categories, currencies }, defaultCurrency: profile?.defaultCurrency ?? undefined };
}

/** Honest reason when a requirement cannot be submitted now (drafts always work). */
export async function loadRequirementSubmitBlock(ctx: OrgContext<"employer">): Promise<string | null> {
  if (ctx.organization.status === "suspended") return "Your company is suspended, so new requirements cannot be submitted. Contact Venkat Sai support.";
  const check = await checkEntitlement(ctx.organization.id, "bulk_requirements").catch(() => null);
  if (check && !check.allowed) return check.reason ?? "Your plan's requirement limit is reached. Upgrade your plan to submit more requirements.";
  return null;
}

/** Attachments of a requirement, limited to files uploaded for this organisation. */
export async function loadRequirementAttachments(ctx: OrgContext<"employer">, ids: readonly string[]): Promise<FileSummary[]> {
  if (!ids.length) return [];
  const files = await getFiles(ids);
  return files.filter((f) => f.organizationId === ctx.organization.id).map(toFileSummary);
}

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? undefined : String(v));
const money = (minor: number | null, currency: string | null) => (minor !== null && currency ? String(fromMinorUnits(minor, currency)) : "");

export function requirementFormDefaults(r: EmployerRequirementView): RequirementFormDefaults {
  return {
    kind: r.kind,
    title: r.title,
    description: r.description ?? undefined,
    countryCode: r.countryCode ?? undefined,
    locations: r.locations ?? undefined,
    industryId: r.industryId ?? undefined,
    contractDurationMonths: str(r.contractDurationMonths),
    workingHours: r.workingHours ?? undefined,
    joiningBy: r.joiningBy ?? undefined,
    interviewMethod: r.interviewMethod ?? undefined,
    interviewDetails: r.interviewDetails ?? undefined,
    assessmentRequired: r.assessmentRequired,
    assessmentDetails: r.assessmentDetails ?? undefined,
    documentationRequirements: r.documentationRequirements ?? undefined,
    languageRequirements: r.languageRequirements ?? undefined,
    benefits: r.benefits,
    accommodationProvided: r.accommodationProvided,
    foodProvided: r.foodProvided,
    transportProvided: r.transportProvided,
    urgency: r.urgency,
    contactName: r.contactName ?? undefined,
    contactDesignation: r.contactDesignation ?? undefined,
    contactEmail: r.contactEmail ?? undefined,
    contactPhone: r.contactPhone ?? undefined,
    lines: r.lines.map((l) => ({
      key: l.id,
      id: l.id,
      jobCategoryId: l.jobCategoryId ?? "",
      roleTitle: l.roleTitle,
      positions: String(l.positions),
      experienceMinYears: str(l.experienceMinYears) ?? "",
      experienceMaxYears: str(l.experienceMaxYears) ?? "",
      qualification: l.qualification ?? "",
      requiredSkills: l.requiredSkills ?? [],
      salaryMin: money(l.salaryMinMinor, l.salaryCurrency),
      salaryMax: money(l.salaryMaxMinor, l.salaryCurrency),
      salaryCurrency: l.salaryCurrency ?? "",
      salaryPeriod: l.salaryPeriod ?? "",
      notes: l.notes ?? "",
    })),
  };
}
