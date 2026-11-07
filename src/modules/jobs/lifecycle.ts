/**
 * Job lifecycle rules (pure, client-safe): which action is allowed from which status, which edits
 * send a live job back to review, the listing window, and what a job needs before publication.
 *
 *   draft → pending_approval → published ⇄ paused → closed → archived
 *   pending_approval → changes_requested | rejected (back to the poster) ; pending_approval → draft (withdrawn)
 *   closed → published (reopen / extend) ; published (publishedAt in the future) = scheduled
 */
import type { JobPostingStatus } from "@/db/schema/jobs";

export type JobAction =
  | "edit"
  | "submit"
  | "withdraw"
  | "publish"
  | "pause"
  | "resume"
  | "close"
  | "reopen"
  | "extend"
  | "archive"
  | "delete"
  | "promote"
  | "reschedule";

export const ALLOWED_FROM: Record<JobAction, readonly JobPostingStatus[]> = {
  edit: ["draft", "pending_approval", "changes_requested", "rejected", "published", "paused", "closed"],
  submit: ["draft", "changes_requested", "rejected"],
  withdraw: ["pending_approval"],
  publish: ["draft", "pending_approval", "changes_requested", "rejected"],
  pause: ["published"],
  resume: ["paused"],
  close: ["published", "paused"],
  reopen: ["closed"],
  extend: ["published", "paused", "closed"],
  archive: ["closed", "rejected"],
  delete: ["draft", "changes_requested", "rejected", "closed", "archived"],
  promote: ["published"],
  reschedule: ["published"],
};

export function canTransition(action: JobAction, status: JobPostingStatus): boolean {
  return ALLOWED_FROM[action].includes(status);
}

const ACTION_LABEL: Record<JobAction, string> = {
  edit: "edited",
  submit: "submitted for review",
  withdraw: "withdrawn from review",
  publish: "published",
  pause: "paused",
  resume: "resumed",
  close: "closed",
  reopen: "reopened",
  extend: "extended",
  archive: "archived",
  delete: "deleted",
  promote: "promoted",
  reschedule: "rescheduled",
};

/** User-facing explanation when an action is not allowed from a status. */
export function transitionError(action: JobAction, status: JobPostingStatus): string {
  return `A job that is ${status.replace(/_/g, " ")} cannot be ${ACTION_LABEL[action]}.`;
}

/**
 * Fields whose change on a live (published / paused) employer job requires a new review: what a
 * candidate reads to decide whether to apply. Openings, deadline, start date and the employer's own
 * reference can change without review.
 */
export const REVIEWED_FIELDS = [
  "title",
  "summary",
  "descriptionHtml",
  "responsibilities",
  "qualificationsText",
  "jobCategoryId",
  "industryId",
  "employmentType",
  "workMode",
  "experienceLevel",
  "experienceMinYears",
  "experienceMaxYears",
  "minEducationLevelId",
  "salaryMinMinor",
  "salaryMaxMinor",
  "salaryCurrency",
  "salaryPeriod",
  "salaryVisible",
  "benefits",
  "countryCode",
  "stateRegion",
  "city",
  "visaSponsorship",
  "sponsorshipDetails",
  "accommodationProvided",
  "foodProvided",
  "transportProvided",
  "contractDurationMonths",
  "workingHours",
  "recruitmentProcess",
  "applyMode",
  "externalApplyUrl",
  "isConfidential",
  "confidentialEmployerName",
] as const;
export type ReviewedField = (typeof REVIEWED_FIELDS)[number];

const normalise = (value: unknown): unknown => {
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  if (value instanceof Date) return value.toISOString();
  return value;
};

/** Reviewed fields that differ between the stored job and the update (arrays compared as sets). */
export function changedReviewedFields(before: Partial<Record<ReviewedField, unknown>>, after: Partial<Record<ReviewedField, unknown>>): ReviewedField[] {
  return REVIEWED_FIELDS.filter((field) => field in after && normalise(before[field]) !== normalise(after[field]));
}

/** Skills, locations and screening questions are reviewed too: compare canonical signatures. */
export function childSignature(items: ReadonlyArray<Record<string, unknown>>, keys: readonly string[]): string {
  return JSON.stringify(items.map((item) => keys.map((key) => normalise(item[key]))).map((row) => JSON.stringify(row)).sort());
}

/**
 * Listing window when a job goes live. A job published before keeps its first publication date
 * (re-approval after edits never makes it look new); a scheduled job goes live at the scheduled
 * time; the expiry defaults to `defaultDurationDays` and is capped at `maxDays`.
 */
export function computeListingWindow(input: {
  now: Date;
  previousPublishedAt: Date | null;
  scheduledPublishAt: Date | null;
  currentExpiresAt: Date | null;
  defaultDurationDays: number;
  maxDays: number;
}): { publishedAt: Date; expiresAt: Date } {
  const { now } = input;
  const goLive = input.scheduledPublishAt && input.scheduledPublishAt > now ? input.scheduledPublishAt : now;
  const publishedAt = input.previousPublishedAt ?? goLive;
  const from = goLive.getTime();
  const maxExpiry = from + input.maxDays * 86_400_000;
  const keep = input.currentExpiresAt && input.currentExpiresAt.getTime() > from ? input.currentExpiresAt.getTime() : null;
  const expiresAt = new Date(Math.min(keep ?? from + Math.max(1, input.defaultDurationDays) * 86_400_000, maxExpiry));
  return { publishedAt, expiresAt };
}

export type PublishableJob = {
  title: string;
  summary: string | null;
  descriptionHtml: string | null;
  workMode: string;
  countryCode: string | null;
  applyMode: string;
  externalApplyUrl: string | null;
  isConfidential: boolean;
  organizationId: string | null;
  confidentialEmployerName: string | null;
  applicationDeadline: Date | null;
  expiresAt: Date | null;
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
};

/** What is missing before a job can go live (empty = publishable). Messages are user-facing. */
export function publicationProblems(job: PublishableJob, now: Date = new Date()): string[] {
  const problems: string[] = [];
  if (!job.title.trim()) problems.push("Add a job title.");
  if (!(job.descriptionHtml && job.descriptionHtml.replace(/<[^>]*>/g, "").trim()) && !job.summary?.trim()) problems.push("Add a job description or summary.");
  if (job.workMode !== "remote" && !job.countryCode) problems.push("Add the work location (country).");
  if (job.applyMode === "external_url" && !job.externalApplyUrl) problems.push("Add the external application link.");
  if ((job.isConfidential || !job.organizationId) && !job.confidentialEmployerName?.trim()) problems.push("Add the employer description shown on confidential jobs.");
  if (job.applicationDeadline && job.applicationDeadline <= now) problems.push("The application deadline has passed. Choose a later date.");
  if (job.expiresAt && job.expiresAt <= now) problems.push("The listing end date has passed. Choose a later date.");
  return problems;
}

/**
 * End of a calendar day (23:59:59.999) in an IANA time zone, as a UTC instant — deadlines typed as
 * dates mean "until the end of that day where the platform operates".
 */
export function zonedEndOfDay(date: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  return zonedInstant(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999), timeZone);
}

/**
 * A datetime-local value ("2026-12-01T09:30") read as wall-clock time in `timeZone`; values with an
 * explicit offset or Z are taken as they are.
 */
export function parseZonedDateTime(value: string, timeZone: string): Date {
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) return new Date(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) throw new Error(`Invalid date and time: ${value}`);
  return zonedInstant(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0), 0), timeZone);
}

/** `wallClockAsUtc` holds the wall-clock fields as if they were UTC; returns the real instant in `timeZone`. */
function zonedInstant(wallClockAsUtc: number, timeZone: string): Date {
  const guess = wallClockAsUtc;
  const offsetAt = (instant: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - Math.floor(instant / 1000) * 1000;
  };
  // Two passes handle a DST change between the guess and the answer.
  let result = guess - offsetAt(guess);
  result = guess - offsetAt(result);
  return new Date(result);
}
