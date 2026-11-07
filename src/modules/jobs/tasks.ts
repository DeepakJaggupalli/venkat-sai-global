import "server-only";

import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db, type DbOrTx } from "@/db";
import { candidateProfiles, jobAlerts, jobs, users } from "@/db/schema";
import { absoluteUrl } from "@/lib/env";
import { formatSalaryRange } from "@/lib/format";
import { audit } from "@/modules/audit";
import { isMinor } from "@/modules/candidates/profile-rules";
import { hasGuardianConsentRecord } from "@/modules/candidates/refs";
import { notify } from "@/modules/notifications";
import { enqueueTask } from "@/server/tasks/queue";
import type { TaskContext, TaskHandlers } from "@/server/tasks/types";

import { refreshJobDerived } from "./access";
import { matchJobsForAlert } from "./alerts";
import { JOB_LIMITS } from "./constants";
import { closesAtSql, loadJobVisibilityFlags } from "./filters";
import { expireFeaturedFlags } from "./promotion-service";
import { notifyJobOwner } from "./publication";

/**
 * Background task handlers owned by the jobs module.
 * Task type names must be prefixed with "jobs." (see src/server/tasks/schedule.ts for recurring ones).
 *
 *  - jobs.close_expired (hourly): published / paused jobs past their application deadline or listing
 *    end → closed (reason "expired"), organisation notified (job.expired); "closing soon" notice
 *    (job.closing_soon) once per deadline, JOB_LIMITS.closingSoonDays ahead; ended featured windows
 *    cleared; spent schedule markers cleared.
 *  - jobs.alerts_digest (daily): active alerts that are due (daily ≈ 24 h, weekly ≈ 7 days since the
 *    last run) get the jobs published since their watermark (up to 10 listed) via job.alert_digest on
 *    the alert's channels; minors never receive overseas jobs. 200 alerts per run, continued by a
 *    follow-up task.
 *  - jobs.refresh_skill / jobs.refresh_category { id } (on demand): recompute the search columns of
 *    jobs using a renamed skill / category, 200 per run, self-continuing.
 * All are idempotent: closing is conditional on the status, notifications carry dedupe keys.
 */

const CLOSE_BATCH = 200;
const MAX_CLOSE_BATCHES = 25;
const ALERT_BATCH = 200;
const DAY_MS = 86_400_000;
const DUE_AFTER_MS = { daily: 20 * 60 * 60_000, weekly: 6 * DAY_MS + 20 * 60 * 60_000 } as const;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

async function closeExpiredJobs(ctxLog: (message: string, data?: Record<string, unknown>) => void): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_CLOSE_BATCHES; batch++) {
    const closed = await db.transaction(async (tx) => {
      const due = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            inArray(jobs.status, ["published", "paused"]),
            isNull(jobs.deletedAt),
            or(lte(jobs.expiresAt, sql`now()`), lte(jobs.applicationDeadline, sql`now()`)),
          ),
        )
        .orderBy(asc(jobs.id))
        .limit(CLOSE_BATCH)
        .for("update", { skipLocked: true });
      if (!due.length) return [];
      const rows = await tx
        .update(jobs)
        .set({ status: "closed", closedAt: new Date(), closedReason: "expired", isFeatured: false, featuredUntil: null })
        .where(and(inArray(jobs.id, due.map((d) => d.id)), inArray(jobs.status, ["published", "paused"])))
        .returning();
      for (const job of rows) {
        await notifyJobOwner(job, "job.expired", { closedAt: job.closedAt?.toISOString() ?? null }, { tx, dedupeKey: `job-expired:${job.id}:${dayKey(job.closedAt ?? new Date())}` });
        await audit({ action: "job.expired", entityType: "job", entityId: job.id, organizationId: job.organizationId, actorType: "system", tx });
      }
      return rows;
    });
    total += closed.length;
    if (closed.length < CLOSE_BATCH) break;
  }
  ctxLog("jobs.close_expired: closed", { total });
  return total;
}

async function warnClosingSoon(): Promise<number> {
  const rows = await db
    .select({ id: jobs.id, code: jobs.code, title: jobs.title, organizationId: jobs.organizationId, postedByUserId: jobs.postedByUserId, closesAt: sql<Date>`${closesAtSql}` })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        lte(jobs.publishedAt, sql`now()`),
        sql`${closesAtSql} > now()`,
        sql`${closesAtSql} <= now() + make_interval(days => ${JOB_LIMITS.closingSoonDays})`,
      ),
    )
    .limit(1000);
  for (const job of rows) {
    const closesAt = new Date(job.closesAt);
    // One notice per job and closing date (re-sent only if the deadline moves).
    await notifyJobOwner(job, "job.closing_soon", { closesAt: closesAt.toISOString() }, { dedupeKey: `job-closing-soon:${job.id}:${dayKey(closesAt)}` });
  }
  return rows.length;
}

const digestPayload = z.object({ afterId: z.uuid().optional(), runStartedAt: z.iso.datetime().optional() });

async function runAlertDigest(payload: Record<string, unknown>, log: (message: string, data?: Record<string, unknown>) => void): Promise<void> {
  const { afterId, runStartedAt } = digestPayload.parse(payload);
  const runAt = runStartedAt ? new Date(runStartedAt) : new Date();
  const dueBefore = (frequency: keyof typeof DUE_AFTER_MS) => new Date(runAt.getTime() - DUE_AFTER_MS[frequency]);

  const alerts = await db
    .select({ alert: jobAlerts, dateOfBirth: candidateProfiles.dateOfBirth })
    .from(jobAlerts)
    .innerJoin(users, eq(users.id, jobAlerts.userId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.userId, jobAlerts.userId))
    .where(
      and(
        eq(jobAlerts.isActive, true),
        eq(users.status, "active"),
        afterId ? gt(jobAlerts.id, afterId) : undefined,
        or(
          isNull(jobAlerts.lastRunAt),
          and(eq(jobAlerts.frequency, "daily"), lte(jobAlerts.lastRunAt, dueBefore("daily"))),
          and(eq(jobAlerts.frequency, "weekly"), lte(jobAlerts.lastRunAt, dueBefore("weekly"))),
        ),
      ),
    )
    .orderBy(asc(jobAlerts.id))
    .limit(ALERT_BATCH);

  let sent = 0;
  const visibility = await loadJobVisibilityFlags();
  for (const { alert, dateOfBirth } of alerts) {
    const minor = isMinor(dateOfBirth, await hasGuardianConsentRecord(alert.userId, db));
    const { jobs: matches, total } = await matchJobsForAlert(alert, {
      publishedAfter: alert.lastRunAt ?? alert.createdAt,
      publishedBefore: runAt,
      limit: JOB_LIMITS.digestJobs,
      excludeOverseas: minor,
      userId: alert.userId,
      visibility,
    });
    await db.transaction(async (tx) => {
      if (total > 0) {
        await notify(
          {
            event: "job.alert_digest",
            recipients: [{ userId: alert.userId }],
            channels: alert.channels,
            data: {
              alertName: alert.name,
              count: total,
              jobs: matches.map((job) => ({
                title: job.title,
                employer: job.employer.name,
                location: [job.location.city, job.location.countryName ?? job.location.countryCode].filter(Boolean).join(", ") || (job.workMode === "remote" ? "Remote" : ""),
                salary: job.salary ? formatSalaryRange(job.salary.minMinor, job.salary.maxMinor, job.salary.currency, job.salary.period) : null,
                url: absoluteUrl(`/jobs/${job.slug}`),
              })),
            },
            link: `/talent/alerts?alert=${alert.id}`,
            dedupeKey: `job-alert:${alert.id}:${dayKey(runAt)}`,
          },
          { tx },
        );
      }
      await tx
        .update(jobAlerts)
        .set({ lastRunAt: runAt, ...(total > 0 ? { lastSentAt: new Date() } : {}) })
        .where(eq(jobAlerts.id, alert.id));
    });
    if (total > 0) sent += 1;
  }

  if (alerts.length === ALERT_BATCH) {
    const last = alerts[alerts.length - 1]!.alert.id;
    await enqueueTask("jobs.alerts_digest", { afterId: last, runStartedAt: runAt.toISOString() }, { dedupeKey: `jobs.alerts_digest:${dayKey(runAt)}:after:${last}` });
  }
  log("jobs.alerts_digest", { evaluated: alerts.length, sent, continued: alerts.length === ALERT_BATCH });
}

const REFRESH_BATCH = 200;
const refreshPayload = z.object({ id: z.uuid(), afterId: z.uuid().optional() });

/** Recompute the denormalised search columns of jobs using a skill / category (after a taxonomy rename). */
async function refreshJobsUsing(kind: "skill" | "category", payload: Record<string, unknown>, log: TaskContext["log"]): Promise<void> {
  const { id, afterId } = refreshPayload.parse(payload);
  const uses =
    kind === "skill"
      ? sql`exists (select 1 from job_skills js where js.job_id = ${jobs.id} and js.skill_id = ${id})`
      : sql`(${jobs.jobCategoryId} = ${id})`;
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(isNull(jobs.deletedAt), uses, afterId ? gt(jobs.id, afterId) : undefined))
    .orderBy(asc(jobs.id))
    .limit(REFRESH_BATCH);
  for (const row of rows) await db.transaction((tx) => refreshJobDerived(row.id, tx));
  if (rows.length === REFRESH_BATCH) {
    const last = rows[rows.length - 1]!.id;
    await enqueueTask(`jobs.refresh_${kind}`, { id, afterId: last }, { dedupeKey: `jobs.refresh_${kind}:${id}:after:${last}` });
  }
  log(`jobs.refresh_${kind}`, { id, refreshed: rows.length });
}

/** Queue a search-text refresh of every job that lists a skill (call after renaming a skill or changing its synonyms). */
export async function enqueueJobSkillRefresh(skillId: string, tx?: DbOrTx): Promise<void> {
  await enqueueTask("jobs.refresh_skill", { id: skillId }, { tx, dedupeKey: `jobs.refresh_skill:${skillId}:${Math.floor(Date.now() / 60_000)}` });
}

/** Queue a search-text refresh of every job in a category (call after renaming the category). */
export async function enqueueJobCategoryRefresh(categoryId: string, tx?: DbOrTx): Promise<void> {
  await enqueueTask("jobs.refresh_category", { id: categoryId }, { tx, dedupeKey: `jobs.refresh_category:${categoryId}:${Math.floor(Date.now() / 60_000)}` });
}

export const tasks: TaskHandlers = {
  "jobs.refresh_skill": async (payload, ctx) => refreshJobsUsing("skill", payload, ctx.log),
  "jobs.refresh_category": async (payload, ctx) => refreshJobsUsing("category", payload, ctx.log),
  "jobs.close_expired": async (_payload, ctx) => {
    await closeExpiredJobs(ctx.log);
    const warned = await warnClosingSoon();
    const unfeatured = await expireFeaturedFlags();
    // A scheduled job that has gone live no longer needs its schedule marker.
    const result = await db.execute(sql`update jobs set scheduled_publish_at = null where scheduled_publish_at is not null and scheduled_publish_at <= now() and status = 'published'`);
    ctx.log("jobs.close_expired finished", { closingSoonChecked: warned, unfeatured, schedulesCleared: result.rowCount ?? 0 });
  },
  "jobs.alerts_digest": async (payload, ctx) => {
    await runAlertDigest(payload, ctx.log);
  },
};
