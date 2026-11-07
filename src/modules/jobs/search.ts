import "server-only";

import { and, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { countries, jobCategories, jobs } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { humanize } from "@/lib/format";
import { paginated } from "@/lib/http";
import { toPrefixTsQuery } from "@/modules/candidates/profile-rules";
import { orgCan, staffCan } from "@/modules/identity/authz";

import { allOf, closesAtSql, featuredNowSql, jobFilterConditions, loadJobVisibilityFlags, publicJobConditions, type FacetKey } from "./filters";
import { hydrateJobCards, selectJobCardRows } from "./present";
import type { JobSearchFilters } from "./schemas";
import type { JobFacetBucket, JobSearchAudience, JobSearchFacets, JobSearchResult } from "./types";

/**
 * Job search for every audience (spec 8.4 filters): keywords (prefix full-text), category (incl.
 * sub-categories), location text, country, overseas, experience, salary band (same currency and
 * period), industry, qualification, employment type, work mode, verified employers only, recently
 * posted, closing soon, featured, skills — sorted by relevance / newest / closing / salary, paginated,
 * with disjunctive facet counts for the main filters.
 *
 *  - public / talent: only publicly listed jobs (filters.ts). Featured and boosted jobs rank first in
 *    the default order and are always labelled. Talent results carry saved / applied flags.
 *  - employer: the organisation's own jobs in any status (employer.jobs.view).
 *  - admin: every job (jobs.view), optionally deleted ones.
 */

const boostedNowSql: SQL = sql`exists (
  select 1 from job_promotions jp
  where jp.job_id = ${jobs.id} and jp.type = 'boosted' and jp.cancelled_at is null
    and jp.starts_at <= now() and (jp.ends_at is null or jp.ends_at > now()))`;

function authoriseAudience(audience: JobSearchAudience): void {
  if (audience.kind === "employer" && !orgCan(audience.ctx, "employer.jobs.view")) {
    throw new ActionError("You do not have permission to view jobs.", { code: "forbidden" });
  }
  if (audience.kind === "admin" && !staffCan(audience.ctx, "jobs.view")) {
    throw new ActionError("You do not have permission to view jobs.", { code: "forbidden" });
  }
}

async function scopeConditions(audience: JobSearchAudience, filters: JobSearchFilters): Promise<SQL[]> {
  switch (audience.kind) {
    case "public":
    case "talent":
      return publicJobConditions(await loadJobVisibilityFlags());
    case "employer":
      return [eq(jobs.organizationId, audience.ctx.organization.id), isNull(jobs.deletedAt)];
    case "admin": {
      const c: SQL[] = [];
      if (!filters.includeDeleted) c.push(isNull(jobs.deletedAt));
      if (filters.organizationId) c.push(eq(jobs.organizationId, filters.organizationId));
      if (filters.managedOnly) c.push(eq(jobs.managedByVenkatSai, true));
      return c;
    }
  }
}

function orderFor(filters: JobSearchFilters, audience: JobSearchAudience): SQL[] {
  const listing = audience.kind === "public" || audience.kind === "talent";
  const tsQuery = toPrefixTsQuery(filters.q);
  const visibleSalary = listing
    ? sql`case when ${jobs.salaryVisible} then coalesce(${jobs.salaryMaxMinor}, ${jobs.salaryMinMinor}) end`
    : sql`coalesce(${jobs.salaryMaxMinor}, ${jobs.salaryMinMinor})`;
  switch (filters.sort) {
    case "newest":
      return listing ? [sql`${jobs.publishedAt} desc nulls last`] : [desc(jobs.createdAt)];
    case "closing":
      return [sql`case when ${closesAtSql} = 'infinity'::timestamptz then 1 else 0 end`, sql`${closesAtSql} asc`, sql`${jobs.publishedAt} desc nulls last`];
    case "salary":
      return [sql`${visibleSalary} desc nulls last`, sql`${jobs.publishedAt} desc nulls last`];
    default: {
      const promoted = listing ? [sql`${featuredNowSql} desc`, sql`${boostedNowSql} desc`] : [];
      if (tsQuery) return [...promoted, sql`ts_rank_cd(${jobs.searchVector}, to_tsquery('simple', ${tsQuery})) desc`, sql`${jobs.publishedAt} desc nulls last`];
      return listing ? [...promoted, sql`${jobs.publishedAt} desc nulls last`] : [desc(jobs.updatedAt)];
    }
  }
}

async function facetCounts(scope: SQL[], filters: JobSearchFilters, audience: JobSearchAudience): Promise<JobSearchFacets> {
  const opts = (exclude: FacetKey) => ({ publicSalaryOnly: audience.kind === "public" || audience.kind === "talent", management: audience.kind === "employer" || audience.kind === "admin", exclude });
  const where = (exclude: FacetKey) => allOf([...scope, ...jobFilterConditions(filters, opts(exclude))]);

  const [categories, countryRows, types, modes, overseas, verified] = await Promise.all([
    db
      .select({ value: jobs.jobCategoryId, label: jobCategories.name, count: count() })
      .from(jobs)
      .innerJoin(jobCategories, eq(jobCategories.id, jobs.jobCategoryId))
      .where(where("categories"))
      .groupBy(jobs.jobCategoryId, jobCategories.name)
      .orderBy(desc(count()), jobCategories.name)
      .limit(30),
    db
      .select({ value: jobs.countryCode, label: countries.name, count: count() })
      .from(jobs)
      .innerJoin(countries, eq(countries.code, jobs.countryCode))
      .where(where("countries"))
      .groupBy(jobs.countryCode, countries.name)
      .orderBy(desc(count()), countries.name)
      .limit(40),
    db.select({ value: jobs.employmentType, count: count() }).from(jobs).where(where("employmentTypes")).groupBy(jobs.employmentType).orderBy(desc(count())),
    db.select({ value: jobs.workMode, count: count() }).from(jobs).where(where("workModes")).groupBy(jobs.workMode).orderBy(desc(count())),
    db.select({ value: count() }).from(jobs).where(allOf([...scope, ...jobFilterConditions(filters, opts("overseas")), eq(jobs.isOverseas, true)])),
    db
      .select({ value: count() })
      .from(jobs)
      .where(allOf([...scope, ...jobFilterConditions(filters, opts("verified")), sql`(${jobs.verifiedEmployer} or (${jobs.organizationId} is null and ${jobs.managedByVenkatSai}))`])),
  ]);
  const bucket = (rows: { value: string | null; label?: string | null; count: number }[]): JobFacetBucket[] =>
    rows.filter((r) => r.value).map((r) => ({ value: r.value!, label: r.label ?? humanize(r.value), count: Number(r.count) }));
  return {
    categories: bucket(categories),
    countries: bucket(countryRows),
    employmentTypes: bucket(types),
    workModes: bucket(modes),
    overseas: Number(overseas[0]?.value ?? 0),
    verified: Number(verified[0]?.value ?? 0),
  };
}

export async function searchJobs(filters: JobSearchFilters, audience: JobSearchAudience, opts: { facets?: boolean } = {}): Promise<JobSearchResult> {
  authoriseAudience(audience);
  const scope = await scopeConditions(audience, filters);
  const conditions = jobFilterConditions(filters, {
    publicSalaryOnly: audience.kind === "public" || audience.kind === "talent",
    management: audience.kind === "employer" || audience.kind === "admin",
  });
  const where = and(...scope, ...conditions);
  const offset = (filters.page - 1) * filters.pageSize;
  const [rows, totals, facets] = await Promise.all([
    selectJobCardRows(where, orderFor(filters, audience), filters.pageSize, offset),
    db.select({ value: count() }).from(jobs).where(where),
    opts.facets === false ? Promise.resolve(null) : facetCounts(scope, filters, audience),
  ]);
  const items = await hydrateJobCards(rows, audience);
  return { ...paginated(items, Number(totals[0]?.value ?? 0), { page: filters.page, pageSize: filters.pageSize }), facets };
}
