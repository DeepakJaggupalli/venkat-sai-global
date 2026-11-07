import "server-only";

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { applications, countries, jobCategories, jobs, jobSkills, organizations, savedJobs, skills } from "@/db/schema";
import { getFiles, fileUrl, thumbnailUrl } from "@/modules/files";

import { jobDisplayStatus } from "./constants";
import type { JobCard, JobEmployerDisplay, JobSearchAudience } from "./types";

/**
 * Job card selection + hydration shared by search, saved jobs, recommendations and lists.
 * Confidential jobs (isConfidential, or no organisation) never reveal the organisation to public
 * or talent audiences; salaries hidden by the employer are never sent to them either.
 */
export const jobCardColumns = {
  id: jobs.id,
  code: jobs.code,
  slug: jobs.slug,
  title: jobs.title,
  summary: jobs.summary,
  organizationId: jobs.organizationId,
  managedByVenkatSai: jobs.managedByVenkatSai,
  isConfidential: jobs.isConfidential,
  confidentialEmployerName: jobs.confidentialEmployerName,
  jobCategoryId: jobs.jobCategoryId,
  categoryName: jobCategories.name,
  countryCode: jobs.countryCode,
  countryName: countries.name,
  stateRegion: jobs.stateRegion,
  city: jobs.city,
  isOverseas: jobs.isOverseas,
  employmentType: jobs.employmentType,
  workMode: jobs.workMode,
  experienceLevel: jobs.experienceLevel,
  experienceMinYears: jobs.experienceMinYears,
  experienceMaxYears: jobs.experienceMaxYears,
  salaryMinMinor: jobs.salaryMinMinor,
  salaryMaxMinor: jobs.salaryMaxMinor,
  salaryCurrency: jobs.salaryCurrency,
  salaryPeriod: jobs.salaryPeriod,
  salaryVisible: jobs.salaryVisible,
  benefits: jobs.benefits,
  accommodationProvided: jobs.accommodationProvided,
  foodProvided: jobs.foodProvided,
  transportProvided: jobs.transportProvided,
  visaSponsorship: jobs.visaSponsorship,
  openings: jobs.openings,
  publishedAt: jobs.publishedAt,
  applicationDeadline: jobs.applicationDeadline,
  expiresAt: jobs.expiresAt,
  isFeatured: jobs.isFeatured,
  featuredUntil: jobs.featuredUntil,
  infoSource: jobs.infoSource,
  verifiedEmployer: jobs.verifiedEmployer,
  applyMode: jobs.applyMode,
  status: jobs.status,
  deletedAt: jobs.deletedAt,
  viewCount: jobs.viewCount,
  applicationCount: jobs.applicationCount,
  orgName: organizations.name,
  orgSlug: organizations.slug,
  orgLogoFileId: organizations.logoFileId,
  orgIsPublic: organizations.isPublic,
  orgStatus: organizations.status,
  extraLocations: sql<number>`(select count(*)::int from job_locations jl where jl.job_id = ${jobs.id})`,
};

const cardQuery = () =>
  db
    .select(jobCardColumns)
    .from(jobs)
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
    .leftJoin(jobCategories, eq(jobCategories.id, jobs.jobCategoryId))
    .leftJoin(countries, eq(countries.code, jobs.countryCode));

export type JobCardRow = Awaited<ReturnType<typeof cardQuery>>[number];

/** Select job cards (jobs ⟕ organizations, categories, countries) for a condition and order. */
export async function selectJobCardRows(where: SQL | undefined, order: SQL[], limit: number, offset = 0): Promise<JobCardRow[]> {
  return cardQuery()
    .where(where)
    .orderBy(...order, asc(jobs.id))
    .limit(limit)
    .offset(offset);
}

const isManagement = (audience: JobSearchAudience) => audience.kind === "employer" || audience.kind === "admin";

export function employerDisplay(row: Pick<JobCardRow, "isConfidential" | "organizationId" | "confidentialEmployerName" | "verifiedEmployer" | "managedByVenkatSai" | "orgName" | "orgSlug" | "orgIsPublic" | "orgStatus">, logo: { url: string; thumbnailUrl: string | null } | null): JobEmployerDisplay {
  if (row.isConfidential || !row.organizationId) {
    return {
      confidential: true,
      name: row.confidentialEmployerName?.trim() || "Confidential employer",
      organizationId: null,
      slug: null,
      logoUrl: null,
      logoThumbnailUrl: null,
      verified: row.verifiedEmployer,
      managedByVenkatSai: row.managedByVenkatSai,
      hasPublicPage: false,
    };
  }
  return {
    confidential: false,
    name: row.orgName ?? "Employer",
    organizationId: row.organizationId,
    slug: row.orgSlug,
    logoUrl: logo?.url ?? null,
    logoThumbnailUrl: logo?.thumbnailUrl ?? null,
    verified: row.verifiedEmployer,
    managedByVenkatSai: row.managedByVenkatSai,
    hasPublicPage: Boolean(row.orgIsPublic && row.orgStatus === "verified"),
  };
}

/** Public logo URLs for organisations (logos are public files; private ones are skipped). */
export async function loadLogos(fileIds: (string | null)[]): Promise<Map<string, { url: string; thumbnailUrl: string | null }>> {
  const ids = [...new Set(fileIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const files = await getFiles(ids);
  return new Map(files.filter((f) => f.visibility === "public").map((f) => [f.id, { url: fileUrl(f), thumbnailUrl: thumbnailUrl(f) }]));
}

/** Top skill names per job (required first). */
export async function loadJobSkillNames(jobIds: string[], perJob = 6): Promise<Map<string, string[]>> {
  if (!jobIds.length) return new Map();
  const rows = await db
    .select({ jobId: jobSkills.jobId, name: skills.name })
    .from(jobSkills)
    .innerJoin(skills, eq(skills.id, jobSkills.skillId))
    .where(inArray(jobSkills.jobId, jobIds))
    .orderBy(desc(jobSkills.isRequired), asc(jobSkills.sortOrder), asc(skills.name));
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.jobId) ?? [];
    if (list.length < perJob) list.push(row.name);
    map.set(row.jobId, list);
  }
  return map;
}

async function talentFlags(audience: JobSearchAudience, jobIds: string[]): Promise<{ saved: Set<string>; applied: Set<string> } | null> {
  if (audience.kind !== "talent" || !jobIds.length) return null;
  const [saved, applied] = await Promise.all([
    db.select({ jobId: savedJobs.jobId }).from(savedJobs).where(and(eq(savedJobs.userId, audience.userId), inArray(savedJobs.jobId, jobIds))),
    audience.candidateId
      ? db.select({ jobId: applications.jobId }).from(applications).where(and(eq(applications.candidateId, audience.candidateId), inArray(applications.jobId, jobIds)))
      : Promise.resolve([] as { jobId: string }[]),
  ]);
  return { saved: new Set(saved.map((s) => s.jobId)), applied: new Set(applied.map((a) => a.jobId)) };
}

/** Rows → cards for an audience (adds skills, logos and the talent saved / applied flags). */
export async function hydrateJobCards(rows: JobCardRow[], audience: JobSearchAudience, now: Date = new Date()): Promise<JobCard[]> {
  const ids = rows.map((r) => r.id);
  const management = isManagement(audience);
  const [skillNames, logos, flags] = await Promise.all([
    loadJobSkillNames(ids),
    loadLogos(rows.filter((r) => !r.isConfidential && r.organizationId).map((r) => r.orgLogoFileId)),
    talentFlags(audience, ids),
  ]);
  return rows.map((r) => {
    const showSalary = (management || r.salaryVisible) && r.salaryCurrency && r.salaryPeriod && (r.salaryMinMinor !== null || r.salaryMaxMinor !== null);
    const closes = [r.applicationDeadline, r.expiresAt].filter((d): d is Date => d instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: r.id,
      code: r.code,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      employer: employerDisplay(r, r.orgLogoFileId ? (logos.get(r.orgLogoFileId) ?? null) : null),
      category: r.jobCategoryId && r.categoryName ? { id: r.jobCategoryId, name: r.categoryName } : null,
      location: { countryCode: r.countryCode, countryName: r.countryName, stateRegion: r.stateRegion, city: r.city, extraLocations: Number(r.extraLocations ?? 0) },
      isOverseas: r.isOverseas,
      employmentType: r.employmentType,
      workMode: r.workMode,
      experienceLevel: r.experienceLevel,
      experienceMinYears: r.experienceMinYears,
      experienceMaxYears: r.experienceMaxYears,
      salary: showSalary ? { minMinor: r.salaryMinMinor, maxMinor: r.salaryMaxMinor, currency: r.salaryCurrency!, period: r.salaryPeriod! } : null,
      benefits: r.benefits,
      accommodationProvided: r.accommodationProvided,
      foodProvided: r.foodProvided,
      transportProvided: r.transportProvided,
      visaSponsorship: r.visaSponsorship,
      openings: r.openings,
      skills: skillNames.get(r.id) ?? [],
      publishedAt: r.publishedAt,
      applicationDeadline: r.applicationDeadline,
      expiresAt: r.expiresAt,
      closesAt: closes,
      isFeatured: r.isFeatured && (!r.featuredUntil || r.featuredUntil > now),
      infoSource: r.infoSource,
      verifiedEmployer: r.verifiedEmployer,
      applyMode: r.applyMode,
      status: r.status,
      displayStatus: jobDisplayStatus(r, now),
      viewCount: management ? r.viewCount : null,
      applicationCount: management ? r.applicationCount : null,
      organizationName: management ? (r.orgName ?? null) : null,
      isSaved: flags ? flags.saved.has(r.id) : null,
      hasApplied: flags ? flags.applied.has(r.id) : null,
    };
  });
}
