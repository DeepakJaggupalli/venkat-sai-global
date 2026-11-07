/**
 * Job enumerations, limits and small display helpers (client-safe — no server or table imports).
 * The arrays mirror src/db/schema/jobs.ts; the `_…Parity` types fail the type check if they drift.
 */
import type {
  JobAlertChannel,
  JobAlertFrequency,
  JobApplyMode,
  JobCloseReason,
  JobInfoSource,
  JobPostingStatus,
  JobPromotionSource,
  JobPromotionType,
  JobVisaSponsorship,
  ScreeningQuestionType,
} from "@/db/schema/jobs";

export const JOB_STATUS_OPTIONS = ["draft", "pending_approval", "changes_requested", "published", "paused", "closed", "rejected", "archived"] as const;
export const VISA_SPONSORSHIP_OPTIONS = ["provided", "not_provided", "not_applicable"] as const;
export const APPLY_MODE_OPTIONS = ["platform", "external_url"] as const;
export const INFO_SOURCE_OPTIONS = ["verified", "employer_supplied", "pending_review"] as const;
export const CLOSE_REASON_OPTIONS = ["filled", "cancelled", "expired", "duplicate", "other"] as const;
/** Reasons a person may choose when closing a job (`expired` is set only by the system). */
export const MANUAL_CLOSE_REASONS = ["filled", "cancelled", "duplicate", "other"] as const;
export const SCREENING_TYPE_OPTIONS = ["text", "yes_no", "single_choice", "multi_choice", "number"] as const;
export const ALERT_FREQUENCY_OPTIONS = ["daily", "weekly"] as const;
export const ALERT_CHANNEL_OPTIONS = ["email", "in_app", "whatsapp", "sms"] as const;
export const PROMOTION_TYPE_OPTIONS = ["featured", "boosted", "homepage"] as const;
export const PROMOTION_SOURCE_OPTIONS = ["subscription", "purchase", "admin"] as const;

type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _JobStatusParity = Assert<Same<JobPostingStatus, (typeof JOB_STATUS_OPTIONS)[number]>>;
export type _VisaParity = Assert<Same<JobVisaSponsorship, (typeof VISA_SPONSORSHIP_OPTIONS)[number]>>;
export type _ApplyModeParity = Assert<Same<JobApplyMode, (typeof APPLY_MODE_OPTIONS)[number]>>;
export type _InfoSourceParity = Assert<Same<JobInfoSource, (typeof INFO_SOURCE_OPTIONS)[number]>>;
export type _CloseReasonParity = Assert<Same<JobCloseReason, (typeof CLOSE_REASON_OPTIONS)[number]>>;
export type _ScreeningTypeParity = Assert<Same<ScreeningQuestionType, (typeof SCREENING_TYPE_OPTIONS)[number]>>;
export type _AlertFrequencyParity = Assert<Same<JobAlertFrequency, (typeof ALERT_FREQUENCY_OPTIONS)[number]>>;
export type _AlertChannelParity = Assert<Same<JobAlertChannel, (typeof ALERT_CHANNEL_OPTIONS)[number]>>;
export type _PromotionTypeParity = Assert<Same<JobPromotionType, (typeof PROMOTION_TYPE_OPTIONS)[number]>>;
export type _PromotionSourceParity = Assert<Same<JobPromotionSource, (typeof PROMOTION_SOURCE_OPTIONS)[number]>>;

export const JOB_LIMITS = {
  titleMax: 150,
  skills: 30,
  locations: 20,
  screeningQuestions: 15,
  optionsPerQuestion: 20,
  benefits: 20,
  /** Longest listing window a job can be given (days from publication or extension). */
  maxListingDays: 180,
  /** Longest single feature / promotion window (days). */
  maxPromotionDays: 90,
  savedJobsPerUser: 500,
  alertsPerUser: 10,
  /** Jobs listed in one alert digest. */
  digestJobs: 10,
  /** Days before the deadline when "closing soon" is sent to the organisation. */
  closingSoonDays: 3,
} as const;

/** What a person sees as the job's state (adds "scheduled" and "expired" to the stored status). */
export type JobDisplayStatus = JobPostingStatus | "scheduled" | "expired";

export function jobDisplayStatus(
  job: { status: JobPostingStatus; publishedAt: Date | null; expiresAt: Date | null; applicationDeadline: Date | null; deletedAt?: Date | null },
  now: Date = new Date(),
): JobDisplayStatus {
  if (job.status === "published") {
    if (job.publishedAt && job.publishedAt > now) return "scheduled";
    if ((job.expiresAt && job.expiresAt <= now) || (job.applicationDeadline && job.applicationDeadline <= now)) return "expired";
  }
  return job.status;
}

/** schema.org / Google JobPosting employmentType for each platform employment type. */
export const GOOGLE_EMPLOYMENT_TYPE = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
  apprenticeship: "OTHER",
  freelance: "CONTRACTOR",
  gig: "PER_DIEM",
  project_based: "CONTRACTOR",
} as const;
