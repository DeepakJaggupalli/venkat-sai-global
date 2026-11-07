"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { assertGuardianConsentIfMinor, getCandidateByUserId } from "@/modules/candidates/guard";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";

import { createJob, deleteJob, duplicateJob, updateJob } from "./job-service";
import { archiveJob, closeJob, extendJob, pauseJob, publishJob, reopenJob, rescheduleJob, resumeJob, submitJob, withdrawJobSubmission } from "./lifecycle-service";
import { featureJob, promoteJob, setJobInfoSource, setJobRecruitingAgent, unfeatureJob } from "./promotion-service";
import { clearUnavailableSavedJobs, deleteJobAlert, saveJob, saveJobAlert, setJobAlertActive, unsaveJob } from "./saved-alerts-service";
import {
  closeJobSchema,
  extendJobSchema,
  featureJobSchema,
  infoSourceSchema,
  jobAlertSchema,
  jobAlertToggleSchema,
  jobFormSchema,
  jobIdSchema,
  promoteJobSchema,
  publishJobSchema,
  recruitingAgentSchema,
  rescheduleJobSchema,
  savedJobSchema,
  submitJobSchema,
  unfeatureJobSchema,
} from "./schemas";
import type { JobActor } from "./types";

/**
 * Server Actions for the Employer Portal (/employer/jobs), the Command Centre (/admin/jobs) and the
 * People Portal (saved jobs, alerts). Thin: authorise → validate → service → revalidate.
 * Lifecycle actions take `portal: "employer" | "admin"` to choose the acting capacity.
 */

const portalField = z.enum(["employer", "admin"]).default("employer");
const withPortal = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, portal: portalField });

async function resolveActor(portal: "employer" | "admin"): Promise<JobActor> {
  if (portal === "admin") return { kind: "staff", ctx: await requireStaff("jobs.manage") };
  return { kind: "employer", ctx: await requireOrgMember("employer", "employer.jobs.manage") };
}

function refreshJob(portal: "employer" | "admin", jobId?: string, slug?: string): void {
  const base = portal === "admin" ? "/admin/jobs" : "/employer/jobs";
  revalidatePath(base);
  if (jobId) revalidatePath(`${base}/${jobId}`);
  revalidatePath("/jobs");
  if (slug) revalidatePath(`/jobs/${slug}`);
}

const optionalId = z.uuid().optional();

function jobIdFrom(formData: FormData): string | undefined {
  const raw = formData.get("id");
  const parsed = optionalId.safeParse(typeof raw === "string" && raw ? raw : undefined);
  if (!parsed.success) throw new ActionError("Invalid job.");
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Job form (create / update)
// ---------------------------------------------------------------------------

/** Employer job form. Include a hidden `id` input to update an existing job. */
export const saveEmployerJobAction = createFormAction(jobFormSchema, async (input, formData) => {
  const actor = await resolveActor("employer");
  const id = jobIdFrom(formData);
  if (!id) {
    const job = await createJob(actor, input);
    refreshJob("employer", job.id);
    return ok({ id: job.id, sentForReview: false }, "Draft saved");
  }
  const { job, sentForReview } = await updateJob(actor, id, input);
  refreshJob("employer", job.id, job.slug);
  return ok({ id: job.id, sentForReview }, sentForReview ? "Changes sent for review. The job is hidden until they are approved." : "Job saved");
});

/** Command Centre job form (Venkat Sai-managed or employer jobs). Hidden `id` input to update. */
export const saveStaffJobAction = createFormAction(jobFormSchema, async (input, formData) => {
  const actor = await resolveActor("admin");
  const id = jobIdFrom(formData);
  if (!id) {
    const job = await createJob(actor, input);
    refreshJob("admin", job.id);
    return ok({ id: job.id, sentForReview: false }, "Draft saved");
  }
  const { job } = await updateJob(actor, id, input);
  refreshJob("admin", job.id, job.slug);
  return ok({ id: job.id, sentForReview: false }, "Job saved");
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const submitJobAction = createAction(submitJobSchema.extend({ portal: portalField }), async ({ id, scheduledPublishAt, portal }) => {
  const job = await submitJob(await resolveActor(portal), id, { scheduledPublishAt });
  refreshJob(portal, job.id);
  return ok(undefined, "Sent for review");
});

export const withdrawJobAction = createAction(withPortal({ id: z.uuid() }), async ({ id, portal }) => {
  const job = await withdrawJobSubmission(await resolveActor(portal), id);
  refreshJob(portal, job.id);
  return ok(undefined, "Withdrawn from review");
});

export const pauseJobAction = createAction(withPortal({ id: z.uuid() }), async ({ id, portal }) => {
  const job = await pauseJob(await resolveActor(portal), id);
  refreshJob(portal, job.id, job.slug);
  return ok(undefined, "Job paused");
});

export const resumeJobAction = createAction(withPortal({ id: z.uuid() }), async ({ id, portal }) => {
  const job = await resumeJob(await resolveActor(portal), id);
  refreshJob(portal, job.id, job.slug);
  return ok(undefined, "Job resumed");
});

export const closeJobAction = createAction(closeJobSchema.extend({ portal: portalField }), async ({ id, reason, portal }) => {
  const job = await closeJob(await resolveActor(portal), id, reason);
  refreshJob(portal, job.id, job.slug);
  return ok(undefined, "Job closed");
});

export const extendJobAction = createAction(z.object({ portal: portalField }).and(extendJobSchema), async ({ id, applicationDeadline, expiresAt, portal }) => {
  const job = await extendJob(await resolveActor(portal), id, { applicationDeadline, expiresAt });
  refreshJob(portal, job.id, job.slug);
  return ok(undefined, "Dates updated");
});

export const reopenJobAction = createAction(
  withPortal({ id: z.uuid(), applicationDeadline: z.string().optional(), expiresAt: z.string().optional() }),
  async ({ id, applicationDeadline, expiresAt, portal }) => {
    const job = await reopenJob(await resolveActor(portal), id, { applicationDeadline, expiresAt });
    refreshJob(portal, job.id, job.slug);
    return ok(undefined, "Job reopened");
  },
);

export const rescheduleJobAction = createAction(rescheduleJobSchema.extend({ portal: portalField }), async ({ id, scheduledPublishAt, portal }) => {
  const job = await rescheduleJob(await resolveActor(portal), id, scheduledPublishAt);
  refreshJob(portal, job.id, job.slug);
  return ok(undefined, "Publication time updated");
});

export const archiveJobAction = createAction(withPortal({ id: z.uuid() }), async ({ id, portal }) => {
  const job = await archiveJob(await resolveActor(portal), id);
  refreshJob(portal, job.id);
  return ok(undefined, "Job archived");
});

export const deleteJobAction = createAction(withPortal({ id: z.uuid() }), async ({ id, portal }) => {
  await deleteJob(await resolveActor(portal), id);
  refreshJob(portal);
  return ok(undefined, "Job deleted");
});

export const duplicateJobAction = createAction(withPortal({ id: z.uuid() }), async ({ id, portal }) => {
  const copy = await duplicateJob(await resolveActor(portal), id);
  refreshJob(portal, copy.id);
  return ok({ id: copy.id }, "Copy created as a draft");
});

/** Employers feature their live job using the featured_jobs allowance of their plan. */
export const promoteJobAction = createAction(promoteJobSchema, async ({ id, days }) => {
  const actor = await resolveActor("employer");
  await promoteJob(actor, id, days);
  refreshJob("employer", id);
  return ok(undefined, "Job featured");
});

// ---------------------------------------------------------------------------
// Staff only
// ---------------------------------------------------------------------------

export const publishJobAction = createAction(publishJobSchema, async ({ id, scheduledPublishAt, infoVerified }) => {
  const ctx = await requireStaff(["jobs.manage", "jobs.approve"]);
  const job = await publishJob({ kind: "staff", ctx }, id, { scheduledPublishAt, infoVerified });
  refreshJob("admin", job.id, job.slug);
  return ok(undefined, job.publishedAt && job.publishedAt > new Date() ? "Job scheduled" : "Job published");
});

export const featureJobAction = createAction(featureJobSchema, async ({ id, type, until }) => {
  const ctx = await requireStaff("jobs.feature");
  await featureJob({ kind: "staff", ctx }, id, { type, until });
  refreshJob("admin", id);
  return ok(undefined, "Promotion added");
});

export const unfeatureJobAction = createAction(unfeatureJobSchema, async ({ id, type }) => {
  const ctx = await requireStaff("jobs.feature");
  await unfeatureJob({ kind: "staff", ctx }, id, type);
  refreshJob("admin", id);
  return ok(undefined, "Promotion ended");
});

export const setJobInfoSourceAction = createAction(infoSourceSchema, async ({ id, infoSource }) => {
  const ctx = await requireStaff("jobs.approve");
  const job = await setJobInfoSource({ kind: "staff", ctx }, id, infoSource);
  refreshJob("admin", job.id, job.slug);
  return ok(undefined, "Information badge updated");
});

export const setJobRecruitingAgentAction = createFormAction(recruitingAgentSchema, async (input) => {
  const ctx = await requireStaff("jobs.approve");
  const job = await setJobRecruitingAgent({ kind: "staff", ctx }, input);
  refreshJob("admin", job.id, job.slug);
  return ok(undefined, input.mode === "clear" ? "Recruiting agent removed" : "Recruiting agent recorded");
});

// ---------------------------------------------------------------------------
// People Portal: saved jobs and alerts
// ---------------------------------------------------------------------------

/** Saving jobs and alerts collects more of a child's data: refused until a guardian consents (DPDP Act s.9). */
async function assertGuardianConsentForUser(userId: string): Promise<void> {
  const candidate = await getCandidateByUserId(userId);
  if (candidate) await assertGuardianConsentIfMinor(candidate);
}

export const saveJobBookmarkAction = createAction(savedJobSchema, async ({ jobId }) => {
  const user = await requireUser();
  await assertGuardianConsentForUser(user.id);
  await saveJob(user, jobId);
  revalidatePath("/talent/saved");
  return ok(undefined, "Job saved");
});

export const unsaveJobBookmarkAction = createAction(savedJobSchema, async ({ jobId }) => {
  const user = await requireUser();
  await unsaveJob(user, jobId);
  revalidatePath("/talent/saved");
  return ok(undefined, "Removed from saved jobs");
});

export const clearUnavailableSavedJobsAction = createAction(z.object({}), async () => {
  const user = await requireUser();
  const removed = await clearUnavailableSavedJobs(user);
  revalidatePath("/talent/saved");
  return ok({ removed }, removed ? "Removed jobs that are no longer available" : "Nothing to remove");
});

export const saveJobAlertAction = createFormAction(jobAlertSchema, async (input) => {
  const user = await requireUser();
  await assertGuardianConsentForUser(user.id);
  const alert = await saveJobAlert(user, input);
  revalidatePath("/talent/alerts");
  return ok({ id: alert.id }, input.id ? "Job alert updated" : "Job alert created");
});

export const toggleJobAlertAction = createAction(jobAlertToggleSchema, async ({ id, isActive }) => {
  const user = await requireUser();
  if (isActive) await assertGuardianConsentForUser(user.id);
  await setJobAlertActive(user, id, isActive);
  revalidatePath("/talent/alerts");
  return ok(undefined, isActive ? "Job alert turned on" : "Job alert paused");
});

export const deleteJobAlertAction = createAction(jobIdSchema, async ({ id }) => {
  const user = await requireUser();
  await deleteJobAlert(user, id);
  revalidatePath("/talent/alerts");
  return ok(undefined, "Job alert deleted");
});
