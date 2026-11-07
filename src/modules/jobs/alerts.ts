import "server-only";

import { and, count, desc, eq, gt, lte, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { jobs } from "@/db/schema";
import type { JobAlertCriteria } from "@/db/schema/jobs";
import { fromMinorUnits } from "@/lib/format";

import { jobFilterConditions, loadJobVisibilityFlags, publicJobConditions, type JobVisibilityFlags } from "./filters";
import { hydrateJobCards, selectJobCardRows } from "./present";
import { jobSearchFiltersSchema, type JobSearchFilters } from "./schemas";
import type { JobCard } from "./types";

/**
 * Job-alert matching: an alert's saved criteria become job search filters, applied to publicly
 * listed jobs published inside a window (used by the daily digest and the "preview" on /talent/alerts).
 */
export function alertCriteriaToFilters(criteria: JobAlertCriteria): JobSearchFilters {
  return jobSearchFiltersSchema.parse({
    q: criteria.keywords || undefined,
    categoryIds: criteria.categoryIds ?? [],
    countryCodes: criteria.countries ?? [],
    employmentTypes: criteria.employmentTypes ?? [],
    workModes: criteria.workModes ?? [],
    overseas: criteria.overseasOnly ? "true" : undefined,
    salaryMin: criteria.salaryMin ? fromMinorUnits(criteria.salaryMin.amountMinor, criteria.salaryMin.currency) : undefined,
    salaryCurrency: criteria.salaryMin?.currency,
    salaryPeriod: criteria.salaryMin?.period,
    sort: "newest",
  });
}

export type AlertMatchOptions = {
  /** Only jobs that went live after this instant (the alert watermark). */
  publishedAfter?: Date | null;
  /** …and no later than this (defaults to now). */
  publishedBefore?: Date;
  limit?: number;
  /** Minors never receive overseas jobs (DPDP children's-data rule). */
  excludeOverseas?: boolean;
  /** Adds saved / applied flags for this user. */
  userId?: string;
  /** Pre-loaded feature-flag visibility (batch callers load it once). */
  visibility?: JobVisibilityFlags;
};

export async function matchJobsForAlert(alert: { criteria: JobAlertCriteria }, opts: AlertMatchOptions = {}): Promise<{ jobs: JobCard[]; total: number }> {
  const filters = alertCriteriaToFilters(alert.criteria);
  const conditions: SQL[] = [
    ...publicJobConditions(opts.visibility ?? (await loadJobVisibilityFlags())),
    ...jobFilterConditions(filters, { publicSalaryOnly: true, management: false }),
    lte(jobs.publishedAt, opts.publishedBefore ?? new Date()),
  ];
  if (opts.publishedAfter) conditions.push(gt(jobs.publishedAt, opts.publishedAfter));
  if (opts.excludeOverseas) conditions.push(eq(jobs.isOverseas, false));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    selectJobCardRows(where, [desc(jobs.publishedAt)], Math.min(Math.max(opts.limit ?? 10, 1), 50)),
    db.select({ value: count() }).from(jobs).where(where),
  ]);
  const cards = await hydrateJobCards(rows, opts.userId ? { kind: "talent", userId: opts.userId } : { kind: "public" });
  return { jobs: cards, total: Number(totals[0]?.value ?? 0) };
}
