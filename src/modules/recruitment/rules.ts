/**
 * Application creation rules (pure, unit-tested in rules.test.ts).
 */
import type { OrgStatus } from "@/db/schema/_constants";
import type { JobApplyMode, JobPostingStatus } from "@/db/schema/jobs";
import type { ApplicationStatus } from "@/db/schema/recruitment";

export type JobOpenState = {
  status: JobPostingStatus;
  deletedAt: Date | null;
  applyMode: JobApplyMode;
  applicationDeadline: Date | null;
  expiresAt: Date | null;
  organizationStatus: OrgStatus | null;
  organizationDeletedAt: Date | null;
  /** A published job with a future publishedAt is scheduled, not live yet. */
  publishedAt?: Date | null;
};

export type ApplicationBlocker = { code: "job_unavailable" | "job_closed" | "job_expired" | "external_apply"; message: string };

/** Why a job cannot take applications right now, or null when it can (published and live, open, not expired). */
export function jobApplicationBlocker(job: JobOpenState, now: Date = new Date()): ApplicationBlocker | null {
  if (job.deletedAt || job.organizationDeletedAt || job.organizationStatus === "suspended") {
    return { code: "job_unavailable", message: "This job is no longer available." };
  }
  const t = now.getTime();
  if (job.status !== "published") return { code: "job_closed", message: "This job is not accepting applications." };
  if (job.publishedAt && job.publishedAt.getTime() > t) return { code: "job_closed", message: "This job is not open for applications yet." };
  if (job.applyMode === "external_url") return { code: "external_apply", message: "Applications for this job are made on the employer's website." };
  if ((job.applicationDeadline && job.applicationDeadline.getTime() <= t) || (job.expiresAt && job.expiresAt.getTime() <= t)) {
    return { code: "job_expired", message: "The application deadline for this job has passed." };
  }
  return null;
}

export type ApplicationOriginKind = "candidate" | "staff" | "partner";

/**
 * What to do when the candidate already has an application for the job (unique per job + candidate):
 * a candidate may re-apply after withdrawing (the row is reopened with fresh consent and answers);
 * anything else is a duplicate.
 */
export function existingApplicationDecision(existing: { status: ApplicationStatus } | null, origin: ApplicationOriginKind): "create" | "reopen" | "duplicate" {
  if (!existing) return "create";
  if (existing.status === "withdrawn" && origin === "candidate") return "reopen";
  return "duplicate";
}

/**
 * Children are kept out of overseas recruitment (DPDP Rules 2025; candidates' isMinor decides who is a minor):
 * no one applies for, or is put forward for, an overseas job on a minor's behalf.
 */
export function minorOverseasBlocker(
  job: { isOverseas: boolean },
  candidateIsMinor: boolean,
  origin: ApplicationOriginKind,
): { code: "minor_overseas"; message: string } | null {
  if (!job.isOverseas || !candidateIsMinor) return null;
  return {
    code: "minor_overseas",
    message:
      origin === "candidate"
        ? "Overseas jobs are open only to people aged 18 or over, so we can't send this application. You are welcome to apply for jobs that are not overseas."
        : "This candidate is under 18, so they cannot be put forward for an overseas job.",
  };
}

/** Applications on a job with an organisation are visible to that employer at once unless Venkat Sai screens first (managed jobs). */
export function shareWithEmployerOnCreate(job: { organizationId: string | null; managedByVenkatSai: boolean }): boolean {
  return Boolean(job.organizationId) && !job.managedByVenkatSai;
}
