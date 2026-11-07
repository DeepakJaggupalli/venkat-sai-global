import "server-only";

import { eq } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { jobs, organizations } from "@/db/schema";
import type { JobCloseReason } from "@/db/schema/jobs";
import { ActionError } from "@/lib/actions";
import { env } from "@/lib/env";
import { cancelApprovalsForEntity, getOpenApprovalForEntity } from "@/modules/approvals/service";
import { audit } from "@/modules/audit";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { staffCan } from "@/modules/identity/authz";
import { isFeatureEnabled } from "@/modules/settings";

import { actorAudit, actorUserId, lockJob } from "./access";
import { JOB_LIMITS } from "./constants";
import { submitJobForReview } from "./job-service";
import { canTransition, parseZonedDateTime, publicationProblems, transitionError, zonedEndOfDay } from "./lifecycle";
import { applyPublication, notifyJobOwner } from "./publication";
import type { JobActor, JobRow } from "./types";

/**
 * Job lifecycle: submit for review, withdraw, publish (staff), pause / resume, close / reopen,
 * extend, reschedule, archive. Every transition is checked against lifecycle.ts, audited, and
 * re-checks the organisation (employers publish only while verified, within their plan).
 */

function assertAllowed(action: Parameters<typeof canTransition>[0], job: JobRow): void {
  if (!canTransition(action, job.status)) throw new ActionError(transitionError(action, job.status), { code: "invalid_status" });
}

function assertPublishable(job: JobRow): void {
  const problems = publicationProblems(job);
  if (problems.length) throw new ActionError(problems.join(" "), { code: "not_publishable" });
}

/** Employer-side gates for anything that makes a job live: verified organisation, self-serve flag, plan. */
async function assertEmployerCanPublish(actor: Extract<JobActor, { kind: "employer" }>, tx: DbOrTx): Promise<void> {
  const [org] = await tx.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, actor.ctx.organization.id)).limit(1);
  if (org?.status !== "verified") {
    throw new ActionError("Your organisation must be verified before jobs can be published. Complete verification in Company settings.", { code: "org_not_verified" });
  }
  if (!(await isFeatureEnabled("employer.self_serve_jobs", { portal: "employer", organizationId: actor.ctx.organization.id }))) {
    throw new ActionError("Job posting by employers is switched off. Contact Venkat Sai to post this job.", { code: "feature_disabled" });
  }
  const entitlement = await checkEntitlement(actor.ctx.organization.id, "job_posts");
  if (!entitlement.allowed) {
    throw new ActionError(entitlement.reason ?? "You have used all job postings in your plan. Upgrade your plan to publish more jobs.", { code: "entitlement_required" });
  }
}

function parseSchedule(value: string | undefined): Date | null {
  if (!value) return null;
  const at = parseZonedDateTime(value, env().DEFAULT_TIMEZONE);
  if (Number.isNaN(at.getTime())) throw new ActionError("Enter a valid publication time.", { fieldErrors: { scheduledPublishAt: ["Enter a valid date and time"] } });
  if (at.getTime() > Date.now() + JOB_LIMITS.maxListingDays * 86_400_000) {
    throw new ActionError("Choose a publication time within the next 180 days.", { fieldErrors: { scheduledPublishAt: ["Too far ahead"] } });
  }
  return at > new Date() ? at : null;
}

/**
 * Send a job for review (approval type job_publication). Employers need a verified organisation
 * and a job posting allowance; staff without jobs.approve use this for Venkat Sai-managed jobs.
 */
export async function submitJob(actor: JobActor, jobId: string, opts: { scheduledPublishAt?: string } = {}): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("submit", job);
    if (actor.kind === "employer") await assertEmployerCanPublish(actor, tx);
    const scheduledPublishAt = parseSchedule(opts.scheduledPublishAt);
    assertPublishable(job);
    const [updated] = await tx
      .update(jobs)
      .set({ status: "pending_approval", infoSource: "pending_review", scheduledPublishAt, moderationNote: null })
      .where(eq(jobs.id, job.id))
      .returning();
    const approval = await submitJobForReview(updated!, actorUserId(actor), tx);
    await notifyJobOwner(updated!, "job.submitted", { approvalCode: approval.code }, { tx, exceptUserId: actorUserId(actor) });
    await audit({
      action: "job.submitted",
      entityType: "job",
      entityId: job.id,
      organizationId: job.organizationId,
      metadata: { approvalId: approval.id, resubmitted: approval.resubmitted, scheduledPublishAt },
      ...actorAudit(actor),
      tx,
    });
    return updated!;
  });
}

/** Take a job back from review (it returns to draft). */
export async function withdrawJobSubmission(actor: JobActor, jobId: string): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("withdraw", job);
    const [updated] = await tx.update(jobs).set({ status: "draft" }).where(eq(jobs.id, job.id)).returning();
    await cancelApprovalsForEntity("job_publication", job.id, actorUserId(actor), "Withdrawn by the poster", tx);
    await audit({ action: "job.submission_withdrawn", entityType: "job", entityId: job.id, organizationId: job.organizationId, ...actorAudit(actor), tx });
    return updated!;
  });
}

/**
 * Staff with jobs.approve publish directly (Venkat Sai jobs, or an employer job they reviewed).
 * An open review of the job is closed as cancelled. `infoVerified` marks the details as checked
 * by Venkat Sai ("verified" badge); otherwise employer jobs show "employer supplied".
 */
export async function publishJob(actor: JobActor, jobId: string, opts: { scheduledPublishAt?: string; infoVerified?: boolean } = {}): Promise<JobRow> {
  if (actor.kind !== "staff" || !staffCan(actor.ctx, ["jobs.manage", "jobs.approve"])) {
    throw new ActionError("Only Venkat Sai staff who approve jobs can publish directly.", { code: "forbidden" });
  }
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "approve");
    assertAllowed("publish", job);
    const scheduledPublishAt = parseSchedule(opts.scheduledPublishAt);
    assertPublishable(job);
    if (await getOpenApprovalForEntity("job_publication", job.id)) {
      await cancelApprovalsForEntity("job_publication", job.id, actor.ctx.user.id, "Published directly by Venkat Sai staff", tx);
    }
    return applyPublication(job, {
      tx,
      actorUserId: actor.ctx.user.id,
      scheduledPublishAt,
      infoSource: opts.infoVerified ? "verified" : undefined,
      reason: "staff_publish",
    });
  });
}

export async function pauseJob(actor: JobActor, jobId: string): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("pause", job);
    const [updated] = await tx.update(jobs).set({ status: "paused" }).where(eq(jobs.id, job.id)).returning();
    await audit({ action: "job.paused", entityType: "job", entityId: job.id, organizationId: job.organizationId, ...actorAudit(actor), tx });
    return updated!;
  });
}

/** Resume a paused job. A job past its deadline or listing end must be extended first. */
export async function resumeJob(actor: JobActor, jobId: string): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("resume", job);
    const now = new Date();
    if ((job.applicationDeadline && job.applicationDeadline <= now) || (job.expiresAt && job.expiresAt <= now)) {
      throw new ActionError("This job's deadline has passed. Extend it to resume the listing.", { code: "expired" });
    }
    if (actor.kind === "employer") {
      const [org] = await tx.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, actor.ctx.organization.id)).limit(1);
      if (org?.status !== "verified") throw new ActionError("Your organisation must be verified to resume jobs.", { code: "org_not_verified" });
    }
    const [updated] = await tx.update(jobs).set({ status: "published" }).where(eq(jobs.id, job.id)).returning();
    await audit({ action: "job.resumed", entityType: "job", entityId: job.id, organizationId: job.organizationId, ...actorAudit(actor), tx });
    return updated!;
  });
}

/** Close a live job (filled, cancelled, duplicate, other). Applications already received stay in the pipeline. */
export async function closeJob(actor: JobActor, jobId: string, reason: Exclude<JobCloseReason, "expired">): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("close", job);
    const [updated] = await tx
      .update(jobs)
      .set({ status: "closed", closedAt: new Date(), closedReason: reason, isFeatured: false, featuredUntil: null })
      .where(eq(jobs.id, job.id))
      .returning();
    await audit({ action: "job.closed", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { reason }, ...actorAudit(actor), tx });
    return updated!;
  });
}

type NewDates = { applicationDeadline?: string; expiresAt?: string };

function resolveNewDates(job: JobRow, dates: NewDates): { applicationDeadline: Date | null; expiresAt: Date | null } {
  const tz = env().DEFAULT_TIMEZONE;
  const now = Date.now();
  const max = now + JOB_LIMITS.maxListingDays * 86_400_000;
  const deadline = dates.applicationDeadline ? zonedEndOfDay(dates.applicationDeadline, tz) : job.applicationDeadline;
  let expiresAt = dates.expiresAt ? zonedEndOfDay(dates.expiresAt, tz) : job.expiresAt;
  if (deadline && deadline.getTime() <= now) throw new ActionError("Choose an application deadline in the future.", { fieldErrors: { applicationDeadline: ["Choose a later date"] } });
  if (deadline && deadline.getTime() > max) throw new ActionError("Choose a deadline within the next 180 days.", { fieldErrors: { applicationDeadline: ["Too far ahead"] } });
  if (expiresAt && expiresAt.getTime() > max) throw new ActionError("Choose a listing end date within the next 180 days.", { fieldErrors: { expiresAt: ["Too far ahead"] } });
  // The listing never ends before the deadline; an expired listing end moves with the new deadline.
  if (deadline && (!expiresAt || expiresAt < deadline)) expiresAt = deadline;
  if (expiresAt && expiresAt.getTime() <= now) throw new ActionError("Choose a listing end date in the future.", { fieldErrors: { expiresAt: ["Choose a later date"] } });
  return { applicationDeadline: deadline, expiresAt };
}

/** Move the deadline / listing end later. A job closed because it expired is reopened. */
export async function extendJob(actor: JobActor, jobId: string, dates: NewDates): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("extend", job);
    if (job.status === "closed" && job.closedReason !== "expired") throw new ActionError("Reopen this job instead of extending it.", { code: "invalid_status" });
    const reopening = job.status === "closed";
    if (reopening && actor.kind === "employer") await assertEmployerCanPublish(actor, tx);
    const next = resolveNewDates(job, dates);
    const [updated] = await tx
      .update(jobs)
      .set({ ...next, ...(reopening ? { status: "published" as const, closedAt: null, closedReason: null } : {}) })
      .where(eq(jobs.id, job.id))
      .returning();
    await audit({
      action: "job.extended",
      entityType: "job",
      entityId: job.id,
      organizationId: job.organizationId,
      metadata: { applicationDeadline: next.applicationDeadline, expiresAt: next.expiresAt, reopened: reopening },
      ...actorAudit(actor),
      tx,
    });
    return updated!;
  });
}

/** Reopen a closed job that was published before (no new review). New dates are required when the old ones have passed. */
export async function reopenJob(actor: JobActor, jobId: string, dates: NewDates = {}): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("reopen", job);
    if (!job.publishedAt) throw new ActionError("This job was never published. Submit it for review instead.", { code: "invalid_status" });
    if (actor.kind === "employer") await assertEmployerCanPublish(actor, tx);
    const next = resolveNewDates(job, dates);
    const [updated] = await tx
      .update(jobs)
      .set({ ...next, status: "published", closedAt: null, closedReason: null })
      .where(eq(jobs.id, job.id))
      .returning();
    await audit({ action: "job.reopened", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: next, ...actorAudit(actor), tx });
    return updated!;
  });
}

/** Change when an approved, not-yet-live job goes live. */
export async function rescheduleJob(actor: JobActor, jobId: string, scheduledPublishAt: string): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("reschedule", job);
    if (!job.publishedAt || job.publishedAt <= new Date()) throw new ActionError("This job is already live.", { code: "invalid_status" });
    const at = parseSchedule(scheduledPublishAt) ?? new Date();
    const shift = at.getTime() - job.publishedAt.getTime();
    const [updated] = await tx
      .update(jobs)
      .set({
        publishedAt: at,
        scheduledPublishAt: at > new Date() ? at : null,
        // Keep the same listing length after the new start.
        expiresAt: job.expiresAt ? new Date(job.expiresAt.getTime() + shift) : null,
      })
      .where(eq(jobs.id, job.id))
      .returning();
    await audit({ action: "job.rescheduled", entityType: "job", entityId: job.id, organizationId: job.organizationId, metadata: { publishedAt: at }, ...actorAudit(actor), tx });
    return updated!;
  });
}

/** Archive a closed or rejected job (hidden from the default lists). */
export async function archiveJob(actor: JobActor, jobId: string): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const job = await lockJob(actor, jobId, tx, "manage");
    assertAllowed("archive", job);
    const [updated] = await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, job.id)).returning();
    await audit({ action: "job.archived", entityType: "job", entityId: job.id, organizationId: job.organizationId, ...actorAudit(actor), tx });
    return updated!;
  });
}
