import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { jobs, organizations } from "@/db/schema";
import type { JobInfoSource } from "@/db/schema/jobs";
import { ActionError } from "@/lib/actions";
import { formatSalaryRange, humanize } from "@/lib/format";
import { excerpt } from "@/lib/sanitize";
import { audit } from "@/modules/audit";
import { consumeEntitlement, EntitlementError } from "@/modules/commercial/entitlements";
import { notify, notifyOrganization, type NotificationEvent } from "@/modules/notifications";
import { getSetting } from "@/modules/settings";

import { JOB_LIMITS } from "./constants";
import { computeListingWindow } from "./lifecycle";
import type { JobRow } from "./types";

/**
 * Publication and owner notifications, shared by the staff publish action, the job_publication
 * approval handler and the background tasks. Deliberately free of the approvals service so the
 * approval registry can import it without a cycle.
 */

/** Notify whoever owns a job: the employer organisation (members who can see jobs), or the staff poster of a Venkat Sai job. */
export async function notifyJobOwner(
  job: Pick<JobRow, "id" | "code" | "title" | "organizationId" | "postedByUserId">,
  event: NotificationEvent,
  data: Record<string, unknown>,
  opts: { tx?: DbOrTx; exceptUserId?: string | null; dedupeKey?: string } = {},
): Promise<void> {
  const payload = { jobTitle: job.title, jobCode: job.code, ...data };
  if (job.organizationId) {
    await notifyOrganization(
      { event, organizationId: job.organizationId, permission: "employer.jobs.view", data: payload, link: `/employer/jobs/${job.id}`, dedupeKey: opts.dedupeKey },
      { tx: opts.tx },
    );
  } else if (job.postedByUserId && job.postedByUserId !== opts.exceptUserId) {
    await notify({ event, recipients: [{ userId: job.postedByUserId }], data: payload, link: `/admin/jobs/${job.id}`, dedupeKey: opts.dedupeKey }, { tx: opts.tx });
  }
}

/**
 * Make a job live (or scheduled): status published, listing window, verified-employer snapshot,
 * info source, job-post credit (employer jobs), owner notification, audit. The caller has checked
 * the actor and the job's state; this re-checks the organisation, which must be verified.
 */
export async function applyPublication(
  job: JobRow,
  opts: { tx: DbOrTx; actorUserId: string | null; infoSource?: JobInfoSource; scheduledPublishAt?: Date | null; reason: "approval" | "staff_publish" },
): Promise<JobRow> {
  const { tx } = opts;
  let verifiedEmployer = false;
  if (job.organizationId) {
    const [org] = await tx.select({ status: organizations.status, deletedAt: organizations.deletedAt }).from(organizations).where(eq(organizations.id, job.organizationId)).limit(1);
    if (!org || org.deletedAt || org.status !== "verified") {
      throw new ActionError("The employer's organisation must be verified before this job can be published.", { code: "org_not_verified" });
    }
    verifiedEmployer = true;
  }
  const now = new Date();
  const scheduled = opts.scheduledPublishAt ?? job.scheduledPublishAt;
  const window = computeListingWindow({
    now,
    previousPublishedAt: job.publishedAt,
    scheduledPublishAt: scheduled,
    currentExpiresAt: job.expiresAt,
    defaultDurationDays: await getSetting("recruitment.job_default_duration_days"),
    maxDays: JOB_LIMITS.maxListingDays,
  });
  // The listing stays up at least until the application deadline (within the maximum window).
  let expiresAt = window.expiresAt;
  if (job.applicationDeadline && job.applicationDeadline > expiresAt) {
    const cap = (scheduled && scheduled > now ? scheduled : now).getTime() + JOB_LIMITS.maxListingDays * 86_400_000;
    expiresAt = new Date(Math.min(job.applicationDeadline.getTime(), cap));
  }
  const infoSource: JobInfoSource = opts.infoSource ?? (job.managedByVenkatSai || !job.organizationId ? "verified" : "employer_supplied");

  const [updated] = await tx
    .update(jobs)
    .set({
      status: "published",
      publishedAt: window.publishedAt,
      expiresAt,
      scheduledPublishAt: scheduled && scheduled > now ? scheduled : null,
      verifiedEmployer,
      infoSource,
      moderationNote: null,
      closedAt: null,
      closedReason: null,
    })
    .where(eq(jobs.id, job.id))
    .returning();

  if (job.organizationId && !job.managedByVenkatSai) {
    try {
      // Idempotent per job reference: re-approval after edits does not consume a second credit.
      await consumeEntitlement(job.organizationId, "job_posts", { reference: { type: "job", id: job.id }, actorUserId: opts.actorUserId, tx });
    } catch (error) {
      if (error instanceof EntitlementError) {
        throw new ActionError("The employer has no job posting credits left. Ask them to renew their plan, then try again.", { code: "entitlement_required" });
      }
      throw error;
    }
  }

  const live = updated!.publishedAt! <= now;
  await notifyJobOwner(
    updated!,
    "job.approved",
    { publishedAt: updated!.publishedAt!.toISOString(), scheduled: !live, expiresAt: expiresAt.toISOString() },
    { tx, exceptUserId: opts.actorUserId },
  );
  await audit({
    action: "job.published",
    entityType: "job",
    entityId: job.id,
    organizationId: job.organizationId,
    metadata: { reason: opts.reason, scheduled: !live, publishedAt: updated!.publishedAt, expiresAt, infoSource, verifiedEmployer },
    actorUserId: opts.actorUserId,
    actorType: opts.actorUserId ? "staff" : "system",
    tx,
  });
  return updated!;
}

/** Snapshot shown to the reviewer in the approval centre (what the candidate will read, plus compliance flags). */
export async function jobReviewSnapshot(job: JobRow, extra: { organizationName: string | null; skills: string[]; screeningQuestionCount: number; locations: string[] }): Promise<Record<string, unknown>> {
  return {
    jobId: job.id,
    code: job.code,
    title: job.title,
    organization: extra.organizationName,
    managedByVenkatSai: job.managedByVenkatSai,
    confidential: job.isConfidential || !job.organizationId,
    confidentialEmployerName: job.confidentialEmployerName,
    employmentType: humanize(job.employmentType),
    workMode: humanize(job.workMode),
    location: [job.city, job.stateRegion, job.countryCode].filter(Boolean).join(", "),
    extraLocations: extra.locations,
    overseas: job.isOverseas,
    experience: job.experienceMinYears !== null || job.experienceMaxYears !== null ? `${job.experienceMinYears ?? 0}–${job.experienceMaxYears ?? "any"} years` : null,
    salary: formatSalaryRange(job.salaryMinMinor, job.salaryMaxMinor, job.salaryCurrency, job.salaryPeriod),
    salaryVisible: job.salaryVisible,
    openings: job.openings,
    summary: job.summary,
    descriptionExcerpt: excerpt(job.descriptionHtml, 400),
    skills: extra.skills,
    screeningQuestions: extra.screeningQuestionCount,
    applicationDeadline: job.applicationDeadline,
    scheduledPublishAt: job.scheduledPublishAt,
    applyMode: job.applyMode,
    externalApplyUrl: job.externalApplyUrl,
    visaSponsorship: job.visaSponsorship,
    compliance: {
      overseas: job.isOverseas,
      // Overseas jobs advertised by or for a recruiting agent must show a verified certificate (regulatory notes rec. 8).
      recruitingAgentRecorded: Boolean(job.recruitingAgentVerifiedAt),
      externalApply: job.applyMode === "external_url",
    },
  };
}
