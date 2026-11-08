/**
 * "Send your CV" — labels, limits and zod schemas (client-safe: the public form, the route handler and the
 * Command Centre share them). The file itself is validated by the files module (purpose `cv_submission`).
 */
import { z } from "zod";

import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { f } from "@/lib/validation";

export const CV_SUBMISSION_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  shortlisted: "Shortlisted",
  not_suitable: "Not suitable",
} as const satisfies Record<CvSubmissionStatus, string>;

export const CV_SUBMISSION_STATUS_VALUES = Object.keys(CV_SUBMISSION_STATUS_LABELS) as [CvSubmissionStatus, ...CvSubmissionStatus[]];

export const CV_SUBMISSION_STATUS_TONE = {
  new: "info",
  contacted: "warning",
  shortlisted: "success",
  not_suitable: "neutral",
} as const satisfies Record<CvSubmissionStatus, string>;

/** Same as the `cv_submission` file policy: keeps the whole request under the 4.5 MB Vercel body limit. */
export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const CV_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";
export const CV_TYPES_LABEL = "PDF, Word (DOC or DOCX), JPG or PNG";

/** Value of the trade select for "my trade is not listed". */
export const OTHER_TRADE = "other";

/** Hidden honeypot input: accepted (never a validation error, so bots learn nothing); the service checks it. */
const honeypot = z.string().max(500).optional();

const optionalBlank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** Public "Send your CV" fields (the CV file travels next to them in the same multipart request). */
export const cvSubmissionSchema = z
  .object({
    name: f.text({ label: "Your name", max: 120 }),
    phone: f.phone(),
    trade: z.string({ error: "Choose your trade" }).trim().min(1, "Choose your trade").max(60),
    tradeOther: f.optionalText(120),
    experienceYears: f.optionalInt({ min: 0, max: 60 }),
    preferredCountryCode: optionalBlank(z.string().trim().length(2, "Choose a country").toUpperCase()),
    hasPassport: optionalBlank(z.enum(["yes", "no"])).transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
    /** Optional; spaces and hyphens are removed, letters upper-cased, then 6–12 letters/digits. Stored encrypted. */
    passportNumber: optionalBlank(
      z
        .string()
        .trim()
        .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
        .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/, "Enter the passport number as printed: 6 to 12 letters and digits")),
    ),
    /** "Notes for us": the candidate's own remarks. */
    candidateNotes: f.optionalText(1000),
    requirement: optionalBlank(z.string().trim().toLowerCase().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid requirement")),
    consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may call or WhatsApp you about jobs" }),
    website: honeypot,
  })
  .superRefine((v, ctx) => {
    if (v.trade === OTHER_TRADE && !v.tradeOther) ctx.addIssue({ code: "custom", path: ["tradeOther"], message: "Type your trade" });
    if (v.trade !== OTHER_TRADE && !z.uuid().safeParse(v.trade).success) ctx.addIssue({ code: "custom", path: ["trade"], message: "Choose your trade" });
  });
export type CvSubmissionInput = z.output<typeof cvSubmissionSchema>;

export const cvSubmissionStatusSchema = z.object({
  id: f.uuid(),
  status: f.enumOf(CV_SUBMISSION_STATUS_VALUES),
});

/** Staff-only remarks (replaces the whole text; blank clears it). */
export const cvSubmissionRemarksSchema = z.object({
  id: f.uuid(),
  remarks: f.optionalText(4000),
});

export const cvSubmissionFiltersSchema = z.object({
  status: z.enum(CV_SUBMISSION_STATUS_VALUES).optional().catch(undefined),
  trade: z.uuid().optional().catch(undefined),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type CvSubmissionFilters = z.output<typeof cvSubmissionFiltersSchema>;

/** Result returned to the public form after a successful submission. */
export type CvSubmissionResult = {
  /** Reference code (null when the request was dropped as spam: the visitor still sees the confirmation). */
  code: string | null;
  name: string;
  trade: string;
  requirementTitle: string | null;
};
