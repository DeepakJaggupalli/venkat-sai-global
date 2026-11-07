import "server-only";

import { and, asc, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  approvalRequests,
  companyProfiles,
  countries,
  educationLevels,
  industries,
  jobCategories,
  jobLocations,
  jobPromotions,
  jobs,
  jobScreeningQuestions,
  jobSkills,
  organizations,
  skills,
} from "@/db/schema";
import type { JobPostingStatus } from "@/db/schema/jobs";
import { ActionError } from "@/lib/actions";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";
import { staffCan } from "@/modules/identity/authz";

import { assertCapability, isUuid } from "./access";
import { JOB_STATUS_OPTIONS, jobDisplayStatus } from "./constants";
import { featuredNowSql, loadJobVisibilityFlags, publicJobConditions } from "./filters";
import { hydrateJobCards, selectJobCardRows } from "./present";
import type { JobSearchFilters } from "./schemas";
import { searchJobs } from "./search";
import type { JobActor, JobCard, JobScreeningQuestionRow, JobSearchResult, ManagedJobDetail, PublicJobDetail } from "./types";

/**
 * Read API of the jobs module. Search lives in search.ts and recommendations in recommendations.ts;
 * both are re-exported here so callers can import every read from one place.
 */
export { searchJobs } from "./search";
export { getRecommendedJobs } from "./recommendations";

function publicQuestion(q: JobScreeningQuestionRow) {
  return { id: q.id, question: q.question, helpText: q.helpText, type: q.type, options: q.options, isRequired: q.isRequired };
}

/**
 * The public / People Portal job page: only publicly listed jobs (published, live, not expired,
 * organisation in good standing). Includes the employer identity and verification snapshot, or the
 * confidential description; the recruiting-agent block only while verified and unexpired.
 */
export async function getPublicJobBySlug(slug: string, opts: { userId?: string | null; candidateId?: string | null } = {}): Promise<PublicJobDetail | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean || clean.length > 200) return null;
  const where = and(eq(jobs.slug, clean), ...publicJobConditions(await loadJobVisibilityFlags()));
  const [row] = await selectJobCardRows(where, [], 1);
  if (!row) return null;
  const [[card], [job], skillRows, locationRows, questionRows] = await Promise.all([
    hydrateJobCards([row], opts.userId ? { kind: "talent", userId: opts.userId, candidateId: opts.candidateId ?? null } : { kind: "public" }),
    db
      .select({
        descriptionHtml: jobs.descriptionHtml,
        responsibilities: jobs.responsibilities,
        qualificationsText: jobs.qualificationsText,
        industryId: jobs.industryId,
        industryName: industries.name,
        minEducationLevelId: jobs.minEducationLevelId,
        educationName: educationLevels.name,
        sponsorshipDetails: jobs.sponsorshipDetails,
        contractDurationMonths: jobs.contractDurationMonths,
        workingHours: jobs.workingHours,
        recruitmentProcess: jobs.recruitmentProcess,
        startDate: jobs.startDate,
        externalApplyUrl: jobs.externalApplyUrl,
        screeningRequired: jobs.screeningRequired,
        recruitingAgentName: jobs.recruitingAgentName,
        recruitingAgentCertificateNumber: jobs.recruitingAgentCertificateNumber,
        recruitingAgentCertificateValidUntil: jobs.recruitingAgentCertificateValidUntil,
        recruitingAgentVerifiedAt: jobs.recruitingAgentVerifiedAt,
        aboutHtml: companyProfiles.aboutHtml,
        website: organizations.websiteUrl,
        orgCountry: organizations.countryCode,
      })
      .from(jobs)
      .leftJoin(industries, eq(industries.id, jobs.industryId))
      .leftJoin(educationLevels, eq(educationLevels.id, jobs.minEducationLevelId))
      .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
      .leftJoin(companyProfiles, eq(companyProfiles.organizationId, jobs.organizationId))
      .where(eq(jobs.id, row.id))
      .limit(1),
    db
      .select({ id: jobSkills.skillId, name: skills.name, isRequired: jobSkills.isRequired, minYears: jobSkills.minYears })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(eq(jobSkills.jobId, row.id))
      .orderBy(desc(jobSkills.isRequired), asc(jobSkills.sortOrder)),
    db
      .select({ countryCode: jobLocations.countryCode, countryName: countries.name, stateRegion: jobLocations.stateRegion, city: jobLocations.city, openings: jobLocations.openings })
      .from(jobLocations)
      .leftJoin(countries, eq(countries.code, jobLocations.countryCode))
      .where(eq(jobLocations.jobId, row.id))
      .orderBy(asc(jobLocations.sortOrder)),
    db.select().from(jobScreeningQuestions).where(eq(jobScreeningQuestions.jobId, row.id)).orderBy(asc(jobScreeningQuestions.sortOrder)),
  ]);
  if (!card || !job) return null;
  const today = new Date().toISOString().slice(0, 10);
  const agentValid =
    job.recruitingAgentVerifiedAt && job.recruitingAgentName && job.recruitingAgentCertificateNumber && (!job.recruitingAgentCertificateValidUntil || job.recruitingAgentCertificateValidUntil >= today);
  return {
    ...card,
    descriptionHtml: job.descriptionHtml,
    responsibilities: job.responsibilities,
    qualificationsText: job.qualificationsText,
    industry: job.industryId && job.industryName ? { id: job.industryId, name: job.industryName } : null,
    minEducationLevel: job.minEducationLevelId && job.educationName ? { id: job.minEducationLevelId, name: job.educationName } : null,
    sponsorshipDetails: job.sponsorshipDetails,
    contractDurationMonths: job.contractDurationMonths,
    workingHours: job.workingHours,
    recruitmentProcess: job.recruitmentProcess,
    startDate: job.startDate,
    externalApplyUrl: job.externalApplyUrl,
    screeningRequired: job.screeningRequired,
    screeningQuestions: questionRows.map(publicQuestion),
    locations: locationRows,
    skillDetails: skillRows,
    recruitingAgent: agentValid ? { name: job.recruitingAgentName!, certificateNumber: job.recruitingAgentCertificateNumber!, validUntil: job.recruitingAgentCertificateValidUntil } : null,
    employerProfile: card.employer.confidential ? null : { about: job.aboutHtml, website: job.website, country: job.orgCountry, industry: job.industryName },
  };
}

/** A job as its employer (own organisation) or staff (jobs.view) manage it. Null when not found / not theirs. */
export async function getManagedJob(actor: JobActor, jobId: string): Promise<ManagedJobDetail | null> {
  assertCapability(actor, "view");
  if (!isUuid(jobId)) return null;
  const [row] = await db
    .select({ job: jobs, orgName: organizations.name, orgStatus: organizations.status, categoryName: jobCategories.name, industryName: industries.name })
    .from(jobs)
    .leftJoin(organizations, eq(organizations.id, jobs.organizationId))
    .leftJoin(jobCategories, eq(jobCategories.id, jobs.jobCategoryId))
    .leftJoin(industries, eq(industries.id, jobs.industryId))
    .where(and(eq(jobs.id, jobId), actor.kind === "employer" ? and(eq(jobs.organizationId, actor.ctx.organization.id), isNull(jobs.deletedAt)) : undefined))
    .limit(1);
  if (!row) return null;
  const job = row.job;
  const [skillRows, locationRows, questionRows, review, promotions] = await Promise.all([
    db
      .select({ id: jobSkills.skillId, name: skills.name, isRequired: jobSkills.isRequired, minYears: jobSkills.minYears, sortOrder: jobSkills.sortOrder })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(eq(jobSkills.jobId, job.id))
      .orderBy(asc(jobSkills.sortOrder)),
    db
      .select({ id: jobLocations.id, countryCode: jobLocations.countryCode, countryName: countries.name, stateRegion: jobLocations.stateRegion, city: jobLocations.city, openings: jobLocations.openings, sortOrder: jobLocations.sortOrder })
      .from(jobLocations)
      .leftJoin(countries, eq(countries.code, jobLocations.countryCode))
      .where(eq(jobLocations.jobId, job.id))
      .orderBy(asc(jobLocations.sortOrder)),
    db.select().from(jobScreeningQuestions).where(eq(jobScreeningQuestions.jobId, job.id)).orderBy(asc(jobScreeningQuestions.sortOrder)),
    db
      .select({ code: approvalRequests.code, status: approvalRequests.status, reason: approvalRequests.decisionReason, decidedAt: approvalRequests.decidedAt, createdAt: approvalRequests.createdAt })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.type, "job_publication"), eq(approvalRequests.entityId, job.id)))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(1),
    db
      .select({ id: jobPromotions.id, type: jobPromotions.type, startsAt: jobPromotions.startsAt, endsAt: jobPromotions.endsAt, sourceType: jobPromotions.sourceType })
      .from(jobPromotions)
      .where(and(eq(jobPromotions.jobId, job.id), isNull(jobPromotions.cancelledAt), or(isNull(jobPromotions.endsAt), gt(jobPromotions.endsAt, new Date()))))
      .orderBy(desc(jobPromotions.startsAt)),
  ]);
  return {
    job,
    displayStatus: jobDisplayStatus(job),
    organization: job.organizationId && row.orgName ? { id: job.organizationId, name: row.orgName, status: row.orgStatus ?? "draft" } : null,
    category: job.jobCategoryId && row.categoryName ? { id: job.jobCategoryId, name: row.categoryName } : null,
    industry: job.industryId && row.industryName ? { id: job.industryId, name: row.industryName } : null,
    skills: skillRows,
    locations: locationRows,
    screeningQuestions: questionRows.map((q) => ({ ...publicQuestion(q), knockout: q.knockoutAnswer, sortOrder: q.sortOrder })),
    latestReview: review[0] ?? null,
    activePromotions: promotions,
  };
}

/** Employer portal: one of the organisation's jobs (employer.jobs.view). */
export async function getJobForEmployer(ctx: OrgContext<"employer">, jobId: string): Promise<ManagedJobDetail | null> {
  return getManagedJob({ kind: "employer", ctx }, jobId);
}

/** Command Centre: any job, including deleted ones (jobs.view). */
export async function getJobForStaff(ctx: StaffContext, jobId: string): Promise<ManagedJobDetail | null> {
  return getManagedJob({ kind: "staff", ctx }, jobId);
}

/** Employer portal job list (own organisation, any status except deleted; no facets). */
export async function listEmployerJobs(ctx: OrgContext<"employer">, filters: JobSearchFilters): Promise<JobSearchResult> {
  return searchJobs(filters, { kind: "employer", ctx }, { facets: false });
}

/** Command Centre job list with every filter and facet counts (jobs.view). Results carry ids for bulk actions. */
export async function listAdminJobs(ctx: StaffContext, filters: JobSearchFilters): Promise<JobSearchResult> {
  return searchJobs(filters, { kind: "admin", ctx }, { facets: true });
}

/** Status counts for the employer dashboard (deleted jobs excluded). */
export async function countEmployerJobsByStatus(ctx: OrgContext<"employer">): Promise<Record<JobPostingStatus, number>> {
  assertCapability({ kind: "employer", ctx }, "view");
  const rows = await db
    .select({ status: jobs.status, value: count() })
    .from(jobs)
    .where(and(eq(jobs.organizationId, ctx.organization.id), isNull(jobs.deletedAt)))
    .groupBy(jobs.status);
  const out = Object.fromEntries(JOB_STATUS_OPTIONS.map((s) => [s, 0])) as Record<JobPostingStatus, number>;
  for (const row of rows) out[row.status] = Number(row.value);
  return out;
}

/**
 * Promoted public jobs: "featured" (featured flag active) or "homepage" (an active homepage
 * promotion). Always labelled "Featured" in the UI.
 */
export async function listFeaturedJobs(opts: { placement?: "featured" | "homepage"; limit?: number } = {}): Promise<JobCard[]> {
  const placement = opts.placement ?? "featured";
  const promoted =
    placement === "homepage"
      ? sql`exists (select 1 from job_promotions jp where jp.job_id = ${jobs.id} and jp.type = 'homepage' and jp.cancelled_at is null and jp.starts_at <= now() and (jp.ends_at is null or jp.ends_at > now()))`
      : featuredNowSql;
  const rows = await selectJobCardRows(and(...publicJobConditions(await loadJobVisibilityFlags()), promoted), [desc(jobs.publishedAt)], Math.min(Math.max(opts.limit ?? 6, 1), 24));
  return hydrateJobCards(rows, { kind: "public" });
}

export type JobApplicationContext = {
  id: string;
  code: string;
  title: string;
  organizationId: string | null;
  managedByVenkatSai: boolean;
  workflowId: string | null;
  isOverseas: boolean;
  screeningRequired: boolean;
  questions: JobScreeningQuestionRow[];
};

/**
 * For the recruitment module's apply flow: the job if it is publicly listed and takes applications
 * on the platform (applyMode = platform), with screening questions INCLUDING knockout rules (server
 * use only — flags for review, never auto-reject). Null otherwise.
 */
export async function getJobForApplication(jobId: string): Promise<JobApplicationContext | null> {
  if (!isUuid(jobId)) return null;
  const [job] = await db
    .select({
      id: jobs.id,
      code: jobs.code,
      title: jobs.title,
      organizationId: jobs.organizationId,
      managedByVenkatSai: jobs.managedByVenkatSai,
      workflowId: jobs.workflowId,
      isOverseas: jobs.isOverseas,
      screeningRequired: jobs.screeningRequired,
      applyMode: jobs.applyMode,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), ...publicJobConditions(await loadJobVisibilityFlags())))
    .limit(1);
  if (!job || job.applyMode !== "platform") return null;
  const questions = await db.select().from(jobScreeningQuestions).where(eq(jobScreeningQuestions.jobId, job.id)).orderBy(asc(jobScreeningQuestions.sortOrder));
  return {
    id: job.id,
    code: job.code,
    title: job.title,
    organizationId: job.organizationId,
    managedByVenkatSai: job.managedByVenkatSai,
    workflowId: job.workflowId,
    isOverseas: job.isOverseas,
    screeningRequired: job.screeningRequired,
    questions,
  };
}

/** Staff-only guard helper for admin pages that need jobs.view without loading a job. */
export function assertCanViewJobs(ctx: StaffContext): void {
  if (!staffCan(ctx, "jobs.view")) throw new ActionError("You do not have permission to view jobs.", { code: "forbidden" });
}
