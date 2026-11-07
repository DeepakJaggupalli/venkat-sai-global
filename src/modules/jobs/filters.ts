import "server-only";

import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";

import { jobs } from "@/db/schema";
import type { EmploymentType } from "@/db/schema/_constants";
import { toMinorUnits } from "@/lib/format";
import { escapeLike, toPrefixTsQuery } from "@/modules/candidates/profile-rules";
import { isFeatureEnabled } from "@/modules/settings";

import type { JobSearchFilters } from "./schemas";

/**
 * SQL building blocks for job queries. The public visibility rule lives here ONLY, so search, the
 * job page, alerts, recommendations and saved jobs can never disagree about what is public:
 *   published · not deleted · went live (publishedAt ≤ now) · not past its listing end or deadline ·
 *   organisation (if any) not deleted, suspended or rejected · service switched on (feature flags).
 */

export type JobVisibilityFlags = { overseas: boolean; internships: boolean; freelance: boolean };

/** Optional People Portal services that hide whole groups of jobs when switched off. */
export async function loadJobVisibilityFlags(): Promise<JobVisibilityFlags> {
  const [overseas, internships, freelance] = await Promise.all([
    isFeatureEnabled("talent.overseas", { portal: "talent" }),
    isFeatureEnabled("talent.internships", { portal: "talent" }),
    isFeatureEnabled("talent.freelance", { portal: "talent" }),
  ]);
  return { overseas, internships, freelance };
}

const FREELANCE_TYPES: EmploymentType[] = ["freelance", "gig", "project_based"];

/** Conditions every publicly listed job satisfies (`jobs` must be the queried table). */
export function publicJobConditions(flags: JobVisibilityFlags): SQL[] {
  const conditions: SQL[] = [
    eq(jobs.status, "published"),
    isNull(jobs.deletedAt),
    isNotNull(jobs.publishedAt),
    lte(jobs.publishedAt, sql`now()`),
    or(isNull(jobs.expiresAt), sql`${jobs.expiresAt} > now()`)!,
    or(isNull(jobs.applicationDeadline), sql`${jobs.applicationDeadline} > now()`)!,
    sql`(${jobs.organizationId} is null or exists (
      select 1 from organizations o
      where o.id = ${jobs.organizationId} and o.deleted_at is null and o.status not in ('suspended', 'rejected')))`,
  ];
  if (!flags.overseas) conditions.push(eq(jobs.isOverseas, false));
  const hiddenTypes: EmploymentType[] = [...(flags.internships ? [] : (["internship"] as EmploymentType[])), ...(flags.freelance ? [] : FREELANCE_TYPES)];
  if (hiddenTypes.length) conditions.push(sql`${jobs.employmentType} not in (${sql.join(hiddenTypes.map((t) => sql`${t}`), sql`, `)})`);
  return conditions;
}

/** "Featured now": flagged and the window has not ended. */
export const featuredNowSql: SQL = sql`(${jobs.isFeatured} and (${jobs.featuredUntil} is null or ${jobs.featuredUntil} > now()))`;

/** Earliest of deadline and listing end ("closes at"). */
export const closesAtSql: SQL = sql`least(coalesce(${jobs.applicationDeadline}, 'infinity'::timestamptz), coalesce(${jobs.expiresAt}, 'infinity'::timestamptz))`;

export type FacetKey = "categories" | "countries" | "employmentTypes" | "workModes" | "overseas" | "verified";

export type FilterOptions = {
  /** Salary filters only consider salaries visible to the audience (no inference about hidden pay). */
  publicSalaryOnly: boolean;
  /** Employer / admin audiences may filter by status, organisation, info source. */
  management: boolean;
  /** Skip one filter (disjunctive facet counts). */
  exclude?: FacetKey;
};

export function jobFilterConditions(f: JobSearchFilters, opts: FilterOptions): SQL[] {
  const c: SQL[] = [];
  const tsQuery = toPrefixTsQuery(f.q);
  if (tsQuery) c.push(sql`${jobs.searchVector} @@ to_tsquery('simple', ${tsQuery})`);

  if (f.categoryIds.length && opts.exclude !== "categories") {
    const ids = sql.join(f.categoryIds.map((id) => sql`${id}::uuid`), sql`, `);
    // A parent category includes its sub-categories.
    c.push(sql`(${jobs.jobCategoryId} in (${ids}) or ${jobs.jobCategoryId} in (select jc.id from job_categories jc where jc.parent_id in (${ids})))`);
  }
  if (f.industryIds.length) c.push(inArray(jobs.industryId, f.industryIds));
  if (f.location) {
    const pattern = `%${escapeLike(f.location)}%`;
    c.push(sql`(${jobs.city} ilike ${pattern} or ${jobs.stateRegion} ilike ${pattern} or exists (
      select 1 from job_locations jl where jl.job_id = ${jobs.id} and (jl.city ilike ${pattern} or jl.state_region ilike ${pattern})))`);
  }
  if (f.countryCodes.length && opts.exclude !== "countries") {
    const codes = sql.join(f.countryCodes.map((code) => sql`${code}`), sql`, `);
    c.push(sql`(${jobs.countryCode} in (${codes}) or exists (select 1 from job_locations jl where jl.job_id = ${jobs.id} and jl.country_code in (${codes})))`);
  }
  if (f.overseas && opts.exclude !== "overseas") c.push(eq(jobs.isOverseas, true));
  if (f.experienceYears !== undefined) {
    c.push(or(isNull(jobs.experienceMinYears), lte(jobs.experienceMinYears, f.experienceYears))!);
    c.push(or(isNull(jobs.experienceMaxYears), gte(jobs.experienceMaxYears, f.experienceYears))!);
  }
  if (f.experienceLevels.length) c.push(inArray(jobs.experienceLevel, f.experienceLevels));
  if ((f.salaryMin !== undefined || f.salaryMax !== undefined) && f.salaryCurrency && f.salaryPeriod) {
    // Same currency and period only (no conversion); ranges overlap the requested band.
    c.push(eq(jobs.salaryCurrency, f.salaryCurrency), eq(jobs.salaryPeriod, f.salaryPeriod));
    if (opts.publicSalaryOnly) c.push(eq(jobs.salaryVisible, true));
    if (f.salaryMin !== undefined) c.push(sql`coalesce(${jobs.salaryMaxMinor}, ${jobs.salaryMinMinor}) >= ${toMinorUnits(f.salaryMin, f.salaryCurrency)}`);
    if (f.salaryMax !== undefined) c.push(sql`coalesce(${jobs.salaryMinMinor}, ${jobs.salaryMaxMinor}) <= ${toMinorUnits(f.salaryMax, f.salaryCurrency)}`);
  }
  if (f.educationLevelId) {
    c.push(sql`(${jobs.minEducationLevelId} is null or (select el.rank from education_levels el where el.id = ${jobs.minEducationLevelId})
      <= (select mine.rank from education_levels mine where mine.id = ${f.educationLevelId}::uuid))`);
  }
  if (f.employmentTypes.length && opts.exclude !== "employmentTypes") c.push(inArray(jobs.employmentType, f.employmentTypes));
  if (f.workModes.length && opts.exclude !== "workModes") c.push(inArray(jobs.workMode, f.workModes));
  if (f.verifiedOnly && opts.exclude !== "verified") {
    // Verified employers, and jobs Venkat Sai manages for confidential clients.
    c.push(sql`(${jobs.verifiedEmployer} or (${jobs.organizationId} is null and ${jobs.managedByVenkatSai}))`);
  }
  if (f.postedWithinDays) c.push(sql`${jobs.publishedAt} >= now() - make_interval(days => ${f.postedWithinDays})`);
  if (f.closingWithinDays) c.push(sql`${closesAtSql} <= now() + make_interval(days => ${f.closingWithinDays})`, sql`${closesAtSql} > now()`);
  if (f.featuredOnly) c.push(featuredNowSql);
  if (f.skillIds.length) {
    c.push(sql`exists (select 1 from job_skills js where js.job_id = ${jobs.id} and js.skill_id in (${sql.join(f.skillIds.map((id) => sql`${id}::uuid`), sql`, `)}))`);
  }
  if (opts.management) {
    if (f.statuses.length) c.push(inArray(jobs.status, f.statuses));
    if (f.infoSource) c.push(eq(jobs.infoSource, f.infoSource));
  }
  return c;
}

export function allOf(conditions: SQL[]): SQL | undefined {
  return conditions.length ? and(...conditions) : undefined;
}
