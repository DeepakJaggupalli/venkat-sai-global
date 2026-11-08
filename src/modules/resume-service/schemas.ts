/**
 * "Prepare my resume" — the paid resume-writing service (client-safe: the public form, the route handler, the
 * renderers and the Command Centre share these). A resume-writing service is not a placement fee: candidates are
 * never charged to apply for, be submitted to or get a job.
 *
 * Dates travel as ISO "YYYY-MM-DD" strings so the stored JSON round-trips unchanged.
 */
import { z } from "zod";

import { f } from "@/lib/validation";

export const RESUME_REQUEST_STATUSES = ["submitted", "awaiting_payment", "paid", "waived", "generated", "delivered", "cancelled"] as const;
export type ResumeRequestStatus = (typeof RESUME_REQUEST_STATUSES)[number];

export const RESUME_REQUEST_STATUS_LABELS = {
  submitted: "Submitted",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  waived: "Fee waived",
  generated: "Resume ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const satisfies Record<ResumeRequestStatus, string>;

export const RESUME_REQUEST_STATUS_TONE = {
  submitted: "info",
  awaiting_payment: "warning",
  paid: "success",
  waived: "success",
  generated: "success",
  delivered: "neutral",
  cancelled: "neutral",
} as const satisfies Record<ResumeRequestStatus, string>;

/** Photo limit (one file per request keeps every upload under the 4.5 MB Vercel body limit). */
export const RESUME_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const RESUME_PHOTO_ACCEPT = ".jpg,.jpeg,.png,image/jpeg,image/png";

export const MARITAL_STATUS_OPTIONS = ["Single", "Married", "Divorced", "Widowed"] as const;
export const MAX_EXPERIENCE_ROWS = 15;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date "YYYY-MM-DD" (rejects 2025-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v === null ? undefined : v);
const optionalString = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max, "Too long").optional());
const isoDate = (label: string) => z.string({ error: `Enter the ${label}` }).trim().refine(isIsoDate, `Enter a valid ${label}`);
const optionalIsoDate = (label: string) => z.preprocess(blankToUndefined, isoDate(label).optional());

export const experienceRowSchema = z
  .object({
    organisation: z.string({ error: "Enter the company name" }).trim().min(1, "Enter the company name").max(160, "Too long"),
    /** City and country, e.g. "Jubail, Saudi Arabia". */
    location: optionalString(120),
    from: isoDate("start date"),
    to: optionalIsoDate("end date"),
    /** Still working there ("Still Continue"). */
    current: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
    designation: z.string({ error: "Enter your designation" }).trim().min(1, "Enter your designation").max(120, "Too long"),
  })
  .superRefine((row, ctx) => {
    if (!row.current && !row.to) ctx.addIssue({ code: "custom", path: ["to"], message: "Enter the end date, or tick that you still work here" });
    if (row.to && !row.current && row.to < row.from) ctx.addIssue({ code: "custom", path: ["to"], message: "The end date is before the start date" });
  })
  .transform((row) => ({ ...row, to: row.current ? undefined : row.to }));
export type ExperienceRow = z.output<typeof experienceRowSchema>;

export const passportDetailsSchema = z
  .object({
    number: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
        .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/, "Enter the passport number as printed: 6 to 12 letters and digits"))
        .optional(),
    ),
    dateOfIssue: optionalIsoDate("date of issue"),
    dateOfExpiry: optionalIsoDate("date of expiry"),
    placeOfIssue: optionalString(80),
  })
  .superRefine((p, ctx) => {
    if (p.dateOfIssue && p.dateOfExpiry && p.dateOfExpiry <= p.dateOfIssue) ctx.addIssue({ code: "custom", path: ["dateOfExpiry"], message: "The expiry date must be after the date of issue" });
  });
export type PassportDetails = z.output<typeof passportDetailsSchema>;

/** Everything printed on the resume, in the business's own layout order. */
export const resumeDetailsSchema = z
  .object({
    postAppliedFor: z.string({ error: "Enter the post you are applying for" }).trim().min(1, "Enter the post you are applying for").max(120, "Too long"),
    name: f.text({ label: "Your name", max: 120 }),
    fatherName: optionalString(120),
    dateOfBirth: optionalIsoDate("date of birth"),
    maritalStatus: optionalString(30),
    educationQualification: optionalString(200),
    technicalQualification: optionalString(300),
    nationality: optionalString(60),
    /** Optional: the row is left out of the resume when empty. */
    religion: optionalString(60),
    languages: optionalString(200),
    permanentAddress: optionalString(500),
    /** E.164 with country code. */
    contactPhone: f.phone(),
    alternatePhone: z.preprocess(blankToUndefined, f.phone().optional()),
    email: z.preprocess(blankToUndefined, f.optionalEmail()),
    passport: passportDetailsSchema.default({}),
    abroadExperience: z.array(experienceRowSchema).max(MAX_EXPERIENCE_ROWS, `Up to ${MAX_EXPERIENCE_ROWS} rows`).default([]),
    indiaExperience: z.array(experienceRowSchema).max(MAX_EXPERIENCE_ROWS, `Up to ${MAX_EXPERIENCE_ROWS} rows`).default([]),
    /** Declaration with place, date and signature line at the end. */
    declaration: z
      .object({
        include: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
        place: optionalString(80),
      })
      .default({ include: true }),
  })
  .superRefine((d, ctx) => {
    if (d.dateOfBirth) {
      const today = new Date().toISOString().slice(0, 10);
      if (d.dateOfBirth >= today) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Enter a date of birth in the past" });
    }
  });
export type ResumeDetails = z.output<typeof resumeDetailsSchema>;
export type ResumeDetailsInput = z.input<typeof resumeDetailsSchema>;

/** Hidden honeypot input: accepted (never a validation error); the service drops the request when filled. */
const honeypot = z.string().max(500).optional();

/** Public request: the details (JSON) plus consent and notes; the photo travels as a file in the same request. */
export const resumeRequestSchema = z.object({
  details: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, resumeDetailsSchema),
  candidateNotes: f.optionalText(1000),
  consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may call or WhatsApp you about your resume" }),
  website: honeypot,
});
export type ResumeRequestInput = z.output<typeof resumeRequestSchema>;

/** Price setting `resume_service.price`: amount in minor units + ISO currency. 0 = "Price on request". */
export type ResumeServicePrice = { amountMinor: number; currency: string };

export const resumePriceSchema = z.object({
  amount: f.amount(),
  currency: f.currencyCode(),
});

export const resumeRequestFiltersSchema = z.object({
  status: z.enum(RESUME_REQUEST_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type ResumeRequestFilters = z.output<typeof resumeRequestFiltersSchema>;

export const resumeStatusActionSchema = z.object({
  id: f.uuid(),
  /** paid = payment collected offline; waived = no fee; cancelled; delivered = sent to the candidate. */
  status: f.enumOf(["paid", "waived", "cancelled", "delivered", "awaiting_payment"] as const),
  paymentReference: f.optionalText(120),
});

export const resumeNotesActionSchema = z.object({
  id: f.uuid(),
  notes: f.optionalText(4000),
});

/** Staff corrections to the details before (re)generating. */
export const resumeDetailsActionSchema = z.object({
  id: f.uuid(),
  details: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, resumeDetailsSchema),
});

/** Result returned to the public form after a successful request. */
export type ResumeRequestResult = {
  /** Reference code (null when dropped as spam: the visitor still sees the confirmation). */
  code: string | null;
  name: string;
  status: ResumeRequestStatus | null;
  /** Formatted price ("Price on request" when not set). */
  priceLabel: string;
};
