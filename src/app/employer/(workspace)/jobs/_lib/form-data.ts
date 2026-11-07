import "server-only";

import type { JobFormDefaults, JobFormSubmitGate } from "@/components/employer/job-form/job-form";
import { toScreeningDraft, type KnockoutRule } from "@/components/employer/job-form/screening";
import { env } from "@/lib/env";
import { fromMinorUnits } from "@/lib/format";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import type { OrgContext } from "@/modules/identity/authz";
import type { ManagedJobDetail } from "@/modules/jobs/types";
import { getSetting, isFeatureEnabled } from "@/modules/settings";
import { countryOptions, currencyOptions, industryOptions, jobCategoryOptions, listEducationLevels } from "@/modules/taxonomy/queries";

/** Options for the job form selects (server-loaded taxonomies). */
export async function loadJobFormOptions() {
  const [countries, currencies, categories, industries, education, homeCountry] = await Promise.all([
    countryOptions(),
    currencyOptions(),
    jobCategoryOptions(),
    industryOptions(),
    listEducationLevels(),
    getSetting("platform.home_country"),
  ]);
  return {
    options: { countries, currencies, categories, industries, educationLevels: education.map((e) => ({ value: e.id, label: e.name })) },
    homeCountryCode: String(homeCountry || "IN"),
  };
}

/**
 * Whether this organisation can send a job for review now, with an honest explanation when not:
 * verification gate, posting switched off, or a plan limit (upgrade prompt).
 */
export async function loadSubmitGate(ctx: OrgContext<"employer">, status: string | null): Promise<JobFormSubmitGate> {
  const statusAllowsSubmit = status === null || ["draft", "changes_requested", "rejected"].includes(status);
  const [selfServe, entitlement] = await Promise.all([
    isFeatureEnabled("employer.self_serve_jobs", { portal: "employer", organizationId: ctx.organization.id }),
    checkEntitlement(ctx.organization.id, "job_posts").catch(() => null),
  ]);
  let blockReason: string | null = null;
  if (!selfServe) blockReason = "Self-service job posting is switched off for your workspace. Send a workforce requirement and Venkat Sai will post jobs for you.";
  else if (ctx.organization.status !== "verified")
    blockReason = "Your company must be verified by Venkat Sai before jobs can be published. Save your job as a draft now and submit it once verification is approved.";
  const upgradeReason = entitlement && !entitlement.allowed ? (entitlement.reason ?? "Your plan's job post limit is reached. Upgrade your plan to publish more jobs.") : null;
  return { statusAllowsSubmit, allowed: !blockReason, blockReason, upgradeReason };
}

/** YYYY-MM-DD of an instant in the platform time zone (deadlines are stored as end of that day). */
function toDateInput(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: env().DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? undefined : String(v));
const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");

export function jobFormDefaults(detail: ManagedJobDetail): JobFormDefaults {
  const j = detail.job;
  const currency = j.salaryCurrency;
  return {
    title: j.title,
    summary: j.summary ?? undefined,
    descriptionHtml: j.descriptionHtml ?? undefined,
    responsibilities: j.responsibilities ?? undefined,
    qualificationsText: j.qualificationsText ?? undefined,
    jobCategoryId: j.jobCategoryId ?? undefined,
    industryId: j.industryId ?? undefined,
    employmentType: j.employmentType,
    workMode: j.workMode,
    experienceLevel: j.experienceLevel ?? undefined,
    experienceMinYears: str(j.experienceMinYears),
    experienceMaxYears: str(j.experienceMaxYears),
    minEducationLevelId: j.minEducationLevelId ?? undefined,
    openings: str(j.openings),
    salaryMin: currency && j.salaryMinMinor !== null ? String(fromMinorUnits(j.salaryMinMinor, currency)) : undefined,
    salaryMax: currency && j.salaryMaxMinor !== null ? String(fromMinorUnits(j.salaryMaxMinor, currency)) : undefined,
    salaryCurrency: currency ?? undefined,
    salaryPeriod: j.salaryPeriod ?? undefined,
    salaryVisible: j.salaryVisible,
    benefits: j.benefits ?? [],
    countryCode: j.countryCode ?? undefined,
    stateRegion: j.stateRegion ?? undefined,
    city: j.city ?? undefined,
    visaSponsorship: j.visaSponsorship,
    sponsorshipDetails: j.sponsorshipDetails ?? undefined,
    accommodationProvided: tri(j.accommodationProvided),
    foodProvided: tri(j.foodProvided),
    transportProvided: tri(j.transportProvided),
    contractDurationMonths: str(j.contractDurationMonths),
    workingHours: j.workingHours ?? undefined,
    recruitmentProcess: j.recruitmentProcess ?? undefined,
    applicationDeadline: toDateInput(j.applicationDeadline),
    expiresAt: toDateInput(j.expiresAt),
    startDate: toDateInput(j.startDate),
    applyMode: j.applyMode,
    externalApplyUrl: j.externalApplyUrl ?? undefined,
    screeningRequired: j.screeningRequired,
    isConfidential: j.isConfidential,
    confidentialEmployerName: j.confidentialEmployerName ?? undefined,
    employerReference: j.employerReference ?? undefined,
    skills: detail.skills.map((s) => ({ skillId: s.id, name: s.name, isRequired: s.isRequired, minYears: s.minYears })),
    locations: detail.locations.map((l) => ({ key: l.id, countryCode: l.countryCode, stateRegion: l.stateRegion ?? "", city: l.city ?? "", openings: l.openings ? String(l.openings) : "" })),
    screeningQuestions: detail.screeningQuestions.map((q) => toScreeningDraft({ ...q, knockout: q.knockout as KnockoutRule | null })),
  };
}
