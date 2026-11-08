/**
 * "Send your CV" — labels, limits and zod schemas (client-safe: the public form, the route handler and the
 * Command Centre share them). The file itself is validated by the files module (purpose `cv_submission`).
 */
import { z } from "zod";

import type { CvSubmissionDocumentKind, CvSubmissionStatus } from "@/db/schema/cv-submissions";
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
  /**
   * Short-lived signed link token for "Add your documents now (optional)" (null when dropped as spam). Valid for
   * CV_DOCUMENT_CANDIDATE_LINK_HOURS; staff can send a fresh 7-day link from the Command Centre.
   */
  uploadToken: string | null;
};

// ---------------------------------------------------------------------------
// Further documents (one file per upload)
// ---------------------------------------------------------------------------

export const CV_DOCUMENT_KIND_LABELS = {
  certificate: "Certificate",
  licence: "Licence",
  passport_cover: "Passport cover (outside, with punched number)",
  passport_first_page: "Passport first page",
  passport_last_page: "Passport last page",
  photo: "Photo on white background",
  other: "Other document",
} as const satisfies Record<CvSubmissionDocumentKind, string>;

/** Shown in this order (also the CV pack order after the resume). */
export const CV_DOCUMENT_KIND_VALUES = Object.keys(CV_DOCUMENT_KIND_LABELS) as [CvSubmissionDocumentKind, ...CvSubmissionDocumentKind[]];

/** Kinds that hold one file: a new upload replaces the previous one. Certificates, licences and "other" hold many. */
export const CV_DOCUMENT_SINGLE_KINDS: readonly CvSubmissionDocumentKind[] = ["passport_cover", "passport_first_page", "passport_last_page", "photo"];

export const CV_DOCUMENT_KIND_HINTS: Partial<Record<CvSubmissionDocumentKind, string>> = {
  certificate: "Trade, training or education certificates. Add each one separately.",
  licence: "Driving or trade licences. Add each one separately.",
  passport_cover: "The outside cover, showing the punched passport number.",
  passport_first_page: "The page with your photo and details.",
  passport_last_page: "The page with your address and family details.",
  photo: "A recent passport-size photo on a plain white background.",
};

/** One file per request, well under the 4.5 MB request limit. Larger photos are shrunk in the browser first. */
export const CV_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export const CV_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
export const CV_DOCUMENT_TYPES_LABEL = "PDF, JPG, PNG or WebP";
export const CV_DOCUMENT_MAX_PER_SUBMISSION = 40;
export const CV_DOCUMENT_CANDIDATE_LINK_HOURS = 2;
export const CV_DOCUMENT_STAFF_LINK_DAYS = 7;

export const cvDocumentKindSchema = z.enum(CV_DOCUMENT_KIND_VALUES, { error: "Choose the type of document" });

export const cvDocumentMoveSchema = z.object({
  id: f.uuid(),
  direction: z.enum(["up", "down"]),
});

export const cvDocumentDeleteSchema = z.object({
  id: f.uuid(),
});

export const cvUploadLinkSchema = z.object({
  id: f.uuid(),
});
