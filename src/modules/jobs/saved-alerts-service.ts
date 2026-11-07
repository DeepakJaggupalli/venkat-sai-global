import "server-only";

import { and, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { jobAlerts, jobs, savedJobs } from "@/db/schema";
import type { JobAlertCriteria } from "@/db/schema/jobs";
import { ActionError } from "@/lib/actions";
import { toMinorUnits } from "@/lib/format";
import { paginated, type PageQuery, type Paginated } from "@/lib/http";
import { audit } from "@/modules/audit";
import { assertCountries, assertCurrency, assertJobCategories } from "@/modules/candidates/refs";
import type { SessionUser } from "@/modules/identity/session";

import { isUuid } from "./access";
import { JOB_LIMITS } from "./constants";
import { loadJobVisibilityFlags, publicJobConditions } from "./filters";
import { hydrateJobCards, selectJobCardRows } from "./present";
import type { JobAlertInput } from "./schemas";
import type { JobAlertRow, JobAlertView, JobCard } from "./types";

/**
 * Candidate-side job tools: saved jobs and job alerts. Private to the signed-in user (callers pass
 * the session user; nothing here accepts another user's id from the client).
 */

async function isPubliclyListed(jobId: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), ...publicJobConditions(await loadJobVisibilityFlags())))
    .limit(1);
  return Boolean(row);
}

/** Bookmark a publicly listed job (idempotent). */
export async function saveJob(user: SessionUser, jobId: string): Promise<void> {
  if (!(await isPubliclyListed(jobId))) throw new ActionError("This job is no longer available.", { code: "job_unavailable" });
  const [existing] = await db.select({ value: count() }).from(savedJobs).where(eq(savedJobs.userId, user.id));
  if (Number(existing?.value ?? 0) >= JOB_LIMITS.savedJobsPerUser) {
    throw new ActionError(`You can save up to ${JOB_LIMITS.savedJobsPerUser} jobs. Remove some saved jobs first.`, { code: "limit_reached" });
  }
  await db.insert(savedJobs).values({ userId: user.id, jobId }).onConflictDoNothing();
}

export async function unsaveJob(user: SessionUser, jobId: string): Promise<void> {
  await db.delete(savedJobs).where(and(eq(savedJobs.userId, user.id), eq(savedJobs.jobId, jobId)));
}

/** Which of these jobs the user saved. */
export async function getSavedJobIds(user: SessionUser, jobIds: string[]): Promise<Set<string>> {
  if (!jobIds.length) return new Set();
  const rows = await db.select({ jobId: savedJobs.jobId }).from(savedJobs).where(and(eq(savedJobs.userId, user.id), inArray(savedJobs.jobId, jobIds)));
  return new Set(rows.map((r) => r.jobId));
}

/**
 * Saved jobs that are still listed, newest saved first, plus how many saved jobs are no longer
 * available (closed, expired or withdrawn — their current content is not shown).
 */
export async function listSavedJobs(user: SessionUser, page: PageQuery, opts: { candidateId?: string | null } = {}): Promise<Paginated<JobCard> & { unavailableCount: number }> {
  const visible = publicJobConditions(await loadJobVisibilityFlags());
  const savedSubquery = sql`exists (select 1 from saved_jobs sj where sj.job_id = ${jobs.id} and sj.user_id = ${user.id})`;
  const where = and(savedSubquery, ...visible);
  const savedAt = sql`(select sj.created_at from saved_jobs sj where sj.job_id = ${jobs.id} and sj.user_id = ${user.id})`;
  const [rows, visibleTotal, allTotal] = await Promise.all([
    selectJobCardRows(where, [sql`${savedAt} desc`], page.pageSize, page.offset),
    db.select({ value: count() }).from(jobs).where(where),
    db.select({ value: count() }).from(savedJobs).where(eq(savedJobs.userId, user.id)),
  ]);
  const items = await hydrateJobCards(rows, { kind: "talent", userId: user.id, candidateId: opts.candidateId ?? null });
  const total = Number(visibleTotal[0]?.value ?? 0);
  return { ...paginated(items, total, page), unavailableCount: Math.max(0, Number(allTotal[0]?.value ?? 0) - total) };
}

/** Remove saved jobs that are no longer listed. */
export async function clearUnavailableSavedJobs(user: SessionUser): Promise<number> {
  const visible = publicJobConditions(await loadJobVisibilityFlags());
  const listed = db.select({ id: jobs.id }).from(jobs).where(and(...visible));
  const removed = await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, user.id), notInArray(savedJobs.jobId, listed)))
    .returning({ jobId: savedJobs.jobId });
  return removed.length;
}

// ---------------------------------------------------------------------------
// Job alerts
// ---------------------------------------------------------------------------

function toView(row: JobAlertRow): JobAlertView {
  return { id: row.id, name: row.name, criteria: row.criteria, frequency: row.frequency, channels: row.channels, isActive: row.isActive, lastSentAt: row.lastSentAt, createdAt: row.createdAt };
}

function criteriaFromInput(input: JobAlertInput): JobAlertCriteria {
  const criteria: JobAlertCriteria = {};
  if (input.keywords) criteria.keywords = input.keywords;
  if (input.categoryIds.length) criteria.categoryIds = input.categoryIds;
  if (input.countries.length) criteria.countries = input.countries;
  if (input.employmentTypes.length) criteria.employmentTypes = input.employmentTypes;
  if (input.workModes.length) criteria.workModes = input.workModes;
  if (input.overseasOnly) criteria.overseasOnly = true;
  if (input.salaryMin !== undefined && input.salaryCurrency && input.salaryPeriod) {
    criteria.salaryMin = { amountMinor: toMinorUnits(input.salaryMin, input.salaryCurrency), currency: input.salaryCurrency, period: input.salaryPeriod };
  }
  return criteria;
}

export async function listJobAlerts(user: SessionUser): Promise<JobAlertView[]> {
  const rows = await db.select().from(jobAlerts).where(eq(jobAlerts.userId, user.id)).orderBy(desc(jobAlerts.createdAt));
  return rows.map(toView);
}

/** Create (no id) or update (id) a job alert. A new alert only reports jobs published after it was created. */
export async function saveJobAlert(user: SessionUser, input: JobAlertInput): Promise<JobAlertView> {
  return db.transaction(async (tx) => {
    await assertJobCategories(input.categoryIds, "categoryIds", tx);
    await assertCountries(input.countries, "countries", tx);
    await assertCurrency(input.salaryCurrency, "salaryCurrency", tx);
    const values = { name: input.name, criteria: criteriaFromInput(input), frequency: input.frequency, channels: input.channels, isActive: input.isActive };
    if (input.id) {
      const [row] = await tx
        .update(jobAlerts)
        .set(values)
        .where(and(eq(jobAlerts.id, input.id), eq(jobAlerts.userId, user.id)))
        .returning();
      if (!row) throw new ActionError("Job alert not found.", { code: "not_found" });
      return toView(row);
    }
    const [existing] = await tx.select({ value: count() }).from(jobAlerts).where(eq(jobAlerts.userId, user.id));
    if (Number(existing?.value ?? 0) >= JOB_LIMITS.alertsPerUser) {
      throw new ActionError(`You can have up to ${JOB_LIMITS.alertsPerUser} job alerts.`, { code: "limit_reached" });
    }
    const [row] = await tx.insert(jobAlerts).values({ ...values, userId: user.id, lastRunAt: new Date() }).returning();
    await audit({ action: "job_alert.created", entityType: "job_alert", entityId: row!.id, metadata: { frequency: row!.frequency, channels: row!.channels }, actorUserId: user.id, tx });
    return toView(row!);
  });
}

export async function setJobAlertActive(user: SessionUser, alertId: string, isActive: boolean): Promise<void> {
  const rows = await db
    .update(jobAlerts)
    // Re-activating starts from now, so a paused alert does not flood the next digest.
    .set({ isActive, ...(isActive ? { lastRunAt: new Date() } : {}) })
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, user.id)))
    .returning({ id: jobAlerts.id });
  if (!rows.length) throw new ActionError("Job alert not found.", { code: "not_found" });
}

export async function deleteJobAlert(user: SessionUser, alertId: string): Promise<void> {
  const rows = await db.delete(jobAlerts).where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, user.id))).returning({ id: jobAlerts.id });
  if (!rows.length) throw new ActionError("Job alert not found.", { code: "not_found" });
}

/** One of the user's alerts (for the preview page), or null. */
export async function getJobAlert(user: SessionUser, alertId: string): Promise<JobAlertView | null> {
  const [row] = await db.select().from(jobAlerts).where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, user.id))).limit(1);
  return row ? toView(row) : null;
}
