/**
 * Worker reviews — labels, limits, pure helpers and zod schemas (client-safe: the public review form, the Command
 * Centre and the service share them).
 */
import { z } from "zod";

import type { WorkerReviewRequestChannel, WorkerReviewStatus } from "@/db/schema/worker-reviews";
import { f } from "@/lib/validation";

/** Same values as the schema's WORKER_REVIEW_REQUEST_CHANNELS (type-only import keeps Drizzle out of client bundles). */
const REQUEST_CHANNELS = ["whatsapp", "link"] as const satisfies readonly WorkerReviewRequestChannel[];

/** A review link works this long after staff send it. */
export const WORKER_REVIEW_LINK_DAYS = 30;
export const WORKER_REVIEW_BODY_MIN = 2;
export const WORKER_REVIEW_BODY_MAX = 800;
export const WORKER_REVIEW_NAME_MAX = 60;
export const WORKER_REVIEW_TRADE_MAX = 120;

export const WORKER_REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export type WorkerReviewRating = (typeof WORKER_REVIEW_RATINGS)[number];

export const WORKER_REVIEW_RATING_LABELS: Record<WorkerReviewRating, string> = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" };

/** "4 out of 5 (Very good)": the accessible text for a star rating. */
export function ratingText(rating: number): string {
  const label = WORKER_REVIEW_RATING_LABELS[rating as WorkerReviewRating];
  return label ? `${rating} out of 5 (${label})` : `${rating} out of 5`;
}

export const WORKER_REVIEW_STATUS_LABELS = {
  pending: "To approve",
  approved: "On the website",
  rejected: "Not shown",
  hidden: "Hidden",
} as const satisfies Record<WorkerReviewStatus, string>;

export const WORKER_REVIEW_STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  hidden: "neutral",
} as const satisfies Record<WorkerReviewStatus, string>;

/** Tabs of /admin/reviews (?tab=…). */
export const WORKER_REVIEW_TABS = ["ask", "pending", "published", "rejected"] as const;
export type WorkerReviewTab = (typeof WORKER_REVIEW_TABS)[number];
export const WORKER_REVIEW_TAB_LABELS: Record<WorkerReviewTab, string> = {
  ask: "Ask for a review",
  pending: "To approve",
  published: "Published",
  rejected: "Not shown",
};

export function isWorkerReviewTab(value: unknown): value is WorkerReviewTab {
  return typeof value === "string" && (WORKER_REVIEW_TABS as readonly string[]).includes(value);
}

export const WORKER_REVIEW_DECISIONS = ["approve", "reject", "hide", "unhide"] as const;
export type WorkerReviewDecision = (typeof WORKER_REVIEW_DECISIONS)[number];

/** Status changes a staff decision may make: approve (also a rejected review, to undo), reject, hide, show again. */
const TRANSITIONS: Record<WorkerReviewDecision, { from: readonly WorkerReviewStatus[]; to: WorkerReviewStatus }> = {
  approve: { from: ["pending", "rejected"], to: "approved" },
  reject: { from: ["pending"], to: "rejected" },
  hide: { from: ["approved"], to: "hidden" },
  unhide: { from: ["hidden"], to: "approved" },
};

/** True when the decision would put the review on the website (needs the worker's consent). */
export function decisionPublishes(decision: WorkerReviewDecision): boolean {
  return TRANSITIONS[decision].to === "approved";
}

/**
 * The status after a staff decision, or null when it does not apply: the review is not in a state the decision
 * starts from (already handled by someone else), or it would be published without the worker's consent.
 */
export function nextWorkerReviewStatus(current: WorkerReviewStatus, decision: WorkerReviewDecision, consentToPublish: boolean): WorkerReviewStatus | null {
  const transition = TRANSITIONS[decision];
  if (!transition.from.includes(current)) return null;
  if (transition.to === "approved" && !consentToPublish) return null;
  return transition.to;
}

// ---------------------------------------------------------------------------
// Names and messages
// ---------------------------------------------------------------------------

/** "R" or "R." alone: an initial, not a name. */
const INITIAL = /^\p{L}\.?$/u;

/** "RAVI" / "ravi" → "Ravi"; mixed case ("McDonald") is kept as typed. */
function tidyWord(word: string): string {
  const w = word.replace(/[.,;:]+$/u, "");
  if (!w) return w;
  if (w === w.toUpperCase() || w === w.toLowerCase()) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return w;
}

function nameWords(fullName: string): { first: string; rest: string[] } | null {
  const words = fullName.trim().split(/\s+/u).filter((w) => w.replace(/[.,;:]+$/u, "") !== "");
  if (!words.length) return null;
  // Initials first ("K. Ravi Kumar") are common: the first name is the first word that is not an initial.
  const firstIndex = Math.max(0, words.findIndex((w) => !INITIAL.test(w)));
  return { first: tidyWord(words[firstIndex]!), rest: words.filter((_, i) => i !== firstIndex) };
}

/** First name for greetings: "K. Ravi Kumar" → "Ravi". Empty when no name was given. */
export function firstNameOf(fullName: string): string {
  return nameWords(fullName)?.first ?? "";
}

/**
 * Default "Name to show": first name + initial of the last name ("Ravi Kumar Reddy" → "Ravi R.", "Ravi" → "Ravi").
 * The worker can change it on the form.
 */
export function defaultDisplayName(fullName: string): string {
  const words = nameWords(fullName);
  if (!words) return "";
  const last = words.rest.at(-1)?.replace(/[.,;:]+$/u, "");
  const initial = last ? last.charAt(0).toUpperCase() : "";
  return (initial ? `${words.first} ${initial}.` : words.first).slice(0, WORKER_REVIEW_NAME_MAX);
}

/** WhatsApp message staff send with the review link (the link goes last so WhatsApp shows its preview). */
export function reviewRequestMessage(firstName: string, url: string): string {
  const hello = firstName ? `Hello ${firstName}` : "Hello";
  return `${hello}, this is Venkat Sai Global. We hope your new job is going well. How was your experience with us? Please tell us here, it takes 2 minutes: ${url}`;
}

/** Review text as stored: Windows line breaks unified, at most one empty line in a row, no trailing spaces. */
export function tidyReviewText(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** One-line fields (name, trade): runs of spaces collapsed. */
const oneLine = (value: string) => value.replace(/\s+/gu, " ").trim();

const PHONE_LIKE = /(?:\+?\d[\s-]?){9,}/u;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const LINK_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|net|org|info|me|ly|io|co|ae|qa|sa)\b/iu;

/** The review text seems to contain a phone number, email address or link (staff check it before approving). */
export function mentionsContactDetails(text: string): boolean {
  return PHONE_LIKE.test(text) || EMAIL_LIKE.test(text) || LINK_LIKE.test(text);
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RATING_ERROR = "Tap a star to rate us (1 to 5)";

/** Hidden honeypot input: accepted (never a validation error, so bots learn nothing); the service checks it. */
const honeypot = z.string().max(500).optional();

/** The public review form (/review/<token>). */
export const workerReviewSubmitSchema = z.object({
  token: z.string({ error: "This review link is not complete. Please open it again from WhatsApp." }).trim().min(16, "This review link is not complete. Please open it again from WhatsApp.").max(512),
  rating: z.coerce.number({ error: RATING_ERROR }).int(RATING_ERROR).min(1, RATING_ERROR).max(5, RATING_ERROR),
  // Tidied BEFORE the length checks: browsers post each line break as CRLF (2 characters) while the textarea's
  // maxLength counted it as 1, so a long review with line breaks would otherwise be refused after typing it.
  body: z
    .string({ error: "Write a few words about your experience" })
    .transform(tidyReviewText)
    .pipe(
      z
        .string()
        .min(WORKER_REVIEW_BODY_MIN, "Write a few words about your experience")
        .max(WORKER_REVIEW_BODY_MAX, `Please keep your review under ${WORKER_REVIEW_BODY_MAX} characters`),
    ),
  displayName: f.text({ label: "Name to show", max: WORKER_REVIEW_NAME_MAX }).transform(oneLine),
  trade: f.text({ label: "Your trade", max: WORKER_REVIEW_TRADE_MAX }).transform(oneLine),
  countryCode: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "Choose a country from the list")
      .transform((v) => v.toUpperCase())
      .optional(),
  ),
  consentToPublish: f.bool(),
  website: honeypot,
});
export type WorkerReviewSubmitInput = z.output<typeof workerReviewSubmitSchema>;

export const workerReviewModerateSchema = z.object({
  id: z.uuid("Invalid review"),
  decision: z.enum(WORKER_REVIEW_DECISIONS, { error: "Invalid decision" }),
});
export type WorkerReviewModerateInput = z.output<typeof workerReviewModerateSchema>;

export const workerReviewAskSchema = z.object({
  submissionId: z.uuid("Invalid CV submission"),
  channel: z.enum(REQUEST_CHANNELS, { error: "Invalid channel" }),
});
export type WorkerReviewAskInput = z.output<typeof workerReviewAskSchema>;

/** What the public form shows after a review was saved. */
export type WorkerReviewSubmitResult = { firstName: string; consentToPublish: boolean };
