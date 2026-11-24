/**
 * "Send your CV" / quick apply — labels, limits and zod schemas (client-safe: the public form, the route handler and
 * the Command Centre share them). The optional CV file is validated by the files module (purpose `cv_submission`).
 */
import { z } from "zod";

import type { CvSubmissionDocumentKind, CvSubmissionSource, CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { f } from "@/lib/validation";

export const CV_SUBMISSION_STATUS_LABELS = {
  received: "CV received",
  contacted: "Contacted",
  trade_test: "Trade test / interview",
  selected: "Selected",
  medical: "Medical",
  visa: "Visa",
  ticket: "Ticket",
  departed: "Departed",
  not_suitable: "Not suitable",
  on_hold: "On hold",
} as const satisfies Record<CvSubmissionStatus, string>;

export const CV_SUBMISSION_STATUS_VALUES = Object.keys(CV_SUBMISSION_STATUS_LABELS) as [CvSubmissionStatus, ...CvSubmissionStatus[]];

export const CV_SUBMISSION_STATUS_TONE = {
  received: "info",
  contacted: "warning",
  trade_test: "warning",
  selected: "success",
  medical: "brand",
  visa: "brand",
  ticket: "brand",
  departed: "success",
  not_suitable: "neutral",
  on_hold: "neutral",
} as const satisfies Record<CvSubmissionStatus, string>;

/** The placement journey in order (the public /status step tracker); not_suitable and on_hold sit outside it. */
export const CV_SUBMISSION_JOURNEY = ["received", "contacted", "trade_test", "selected", "medical", "visa", "ticket", "departed"] as const satisfies readonly CvSubmissionStatus[];

/** Status values before the placement journey (old links, bookmarks and filters) → current value. */
const LEGACY_STATUS: Record<string, CvSubmissionStatus> = { new: "received", shortlisted: "trade_test" };
const statusValue = (v: unknown) => (typeof v === "string" && v in LEGACY_STATUS ? LEGACY_STATUS[v] : v);

/** Optional YYYY-MM-DD calendar date (kept as a string, like candidate_profiles.passportExpiry). */
const optionalIsoDate = (message: string) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, message)
      .refine((v) => {
        const d = new Date(`${v}T00:00:00.000Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2000-01-01" && v <= "2060-12-31";
      }, message)
      .optional(),
  );

/** Same as the `cv_submission` file policy: keeps the whole request under the 4.5 MB Vercel body limit. */
export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const CV_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";
export const CV_TYPES_LABEL = "PDF, Word (DOC or DOCX), JPG or PNG";

/** Value of the trade select for "my trade is not listed". */
export const OTHER_TRADE = "other";

/**
 * Trade select value for a trade written on a requirement poster that is not one of our job categories:
 * "other:Mechanical helper" is stored like "Other" with that text (works without JavaScript too).
 */
export const POSTER_TRADE_PREFIX = "other:";

/** Trade name → matching key: lower-case, punctuation folded, simple plural dropped ("Welders " → "welder"). */
function tradeKey(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return key.length > 3 && key.endsWith("s") && !key.endsWith("ss") ? key.slice(0, -1) : key;
}

/**
 * A poster's trades, offered first in the apply form's trade picker. A trade that names one of our job categories uses
 * that category; any other trade is sent as "other:<trade>" (stored as an "Other" trade with that text). Pay is shown
 * next to the trade as written on the poster. Duplicates dropped, at most 20.
 */
export function posterTradeOptions(
  trades: readonly { trade: string; pay?: string | null }[],
  categories: readonly { value: string; label: string }[],
): { value: string; label: string }[] {
  const byKey = new Map(categories.map((c) => [tradeKey(c.label), c.value]));
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const t of trades) {
    const name = t.trade.trim().slice(0, 120);
    if (!name) continue;
    const value = byKey.get(tradeKey(name)) ?? `${POSTER_TRADE_PREFIX}${name}`;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label: t.pay?.trim() ? `${name} (${t.pay.trim()})` : name });
    if (out.length >= 20) break;
  }
  return out;
}

/** Upper limit for each experience field and for their sum (kept in experienceYears for matching). */
export const CV_MAX_EXPERIENCE_YEARS = 60;

/** Total years for matching: abroad + India when at least one is given (capped), else the older single figure. */
export function totalExperienceYears(abroad: number | null | undefined, india: number | null | undefined, legacyTotal?: number | null): number | null {
  if (abroad == null && india == null) return legacyTotal ?? null;
  return Math.min(CV_MAX_EXPERIENCE_YEARS, (abroad ?? 0) + (india ?? 0));
}

// ---------------------------------------------------------------------------
// Referral codes ("refer a friend": /r/CODE sets the cookie; /send-cv?ref=CODE)
// ---------------------------------------------------------------------------

/** Cookie set by the referral link route (/r/[code]) and read by /send-cv. */
export const CV_REFERRAL_COOKIE = "vsg_ref";
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/** "ab12cd" → "AB12CD"; anything that is not 4 to 16 letters and digits → null (never an error for the candidate). */
export function normaliseReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** How a submission entered the system (list filter and labels). */
export const CV_SUBMISSION_SOURCE_LABELS = {
  website: "Website",
  import: "Excel import",
  staff: "Added by staff",
} as const satisfies Record<CvSubmissionSource, string>;
export const CV_SUBMISSION_SOURCE_VALUES = Object.keys(CV_SUBMISSION_SOURCE_LABELS) as [CvSubmissionSource, ...CvSubmissionSource[]];

/** "Has CV" list filter. */
export const CV_FILE_FILTER_LABELS = { yes: "Has CV", no: "No CV yet" } as const;

/** Stages after which a per-worker invoice can be raised for the travel agency or company. */
export const CV_INVOICE_STATUSES: readonly CvSubmissionStatus[] = ["selected", "medical", "visa", "ticket", "departed"];

/** Passport number for staff without candidates.view_documents: "XXXX1234" (blank when unknown). */
export function maskPassportLast4(last4: string | null | undefined): string {
  const tail = (last4 ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-4);
  return tail ? `XXXX${tail.toUpperCase()}` : "";
}

/** Hidden honeypot input: accepted (never a validation error, so bots learn nothing); the service checks it. */
const honeypot = z.string().max(500).optional();

const optionalBlank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** Whole years 0–60, blank = not given. */
const experienceField = (where: string) =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? undefined : typeof v === "string" ? v.trim() : v),
    z.coerce
      .number({ error: `Enter your years ${where} as a number, for example 3` })
      .int(`Enter whole years ${where}, for example 3`)
      .min(0, `Enter whole years ${where}, for example 3`)
      .max(CV_MAX_EXPERIENCE_YEARS, `Enter ${CV_MAX_EXPERIENCE_YEARS} years or less`)
      .optional(),
  );

/** A poster trade that is not a job category ("other:Mechanical helper") → Other + that text. */
function expandPosterTrade(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const v = raw as Record<string, unknown>;
  if (typeof v.trade !== "string" || !v.trade.startsWith(POSTER_TRADE_PREFIX)) return raw;
  const text = v.trade.slice(POSTER_TRADE_PREFIX.length).trim().slice(0, 120);
  const typed = typeof v.tradeOther === "string" ? v.tradeOther.trim() : "";
  return { ...v, trade: OTHER_TRADE, tradeOther: typed || text };
}

/**
 * Public quick apply / "Send your CV" fields (the optional CV file travels next to them in the same multipart
 * request). Only name, mobile number and trade are required. Kept as a plain object so other forms can reuse fields.
 */
export const cvSubmissionFieldsSchema = z.object({
  name: f.text({ label: "Your name", max: 120 }),
  phone: f.phone(),
  trade: z.string({ error: "Choose your trade" }).trim().min(1, "Choose your trade").max(60),
  tradeOther: f.optionalText(120),
  /** Optional email, trimmed and lower-cased. */
  email: optionalBlank(z.string().trim().toLowerCase().max(254, "This email address is too long").pipe(z.email("Enter a valid email address, for example name@gmail.com"))),
  experienceAbroadYears: experienceField("abroad"),
  experienceIndiaYears: experienceField("in India"),
  /** The older single "Years of experience" field (pages opened before the split); used only when both new fields are empty. */
  experienceYears: f.optionalInt({ min: 0, max: CV_MAX_EXPERIENCE_YEARS }).catch(undefined),
  /** From a "refer a friend" link; anything invalid is dropped silently. */
  referralCode: z.preprocess((v) => normaliseReferralCode(v) ?? undefined, z.string().optional()),
  preferredCountryCode: optionalBlank(z.string().trim().length(2, "Choose a country").toUpperCase()),
  /** Older forms asked "Do you have a passport?"; still accepted. A passport number implies yes. */
  hasPassport: optionalBlank(z.enum(["yes", "no"])).transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
  /** Optional; spaces and hyphens are removed, letters upper-cased, then 6–12 letters/digits. Stored encrypted. */
  passportNumber: optionalBlank(
    z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/, "Enter the passport number as printed: 6 to 12 letters and digits")),
  ),
  /** Optional passport expiry date (alerts staff and the candidate before it runs out). */
  passportExpiry: optionalIsoDate("Enter the expiry date printed on your passport"),
  /** "Notes for us": the candidate's own remarks. */
  candidateNotes: f.optionalText(1000),
  requirement: optionalBlank(z.string().trim().toLowerCase().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid requirement")),
  consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may call or WhatsApp you about jobs" }),
  website: honeypot,
});

export const cvSubmissionSchema = z.preprocess(expandPosterTrade, cvSubmissionFieldsSchema).superRefine((v, ctx) => {
  if (v.trade === OTHER_TRADE && !v.tradeOther) ctx.addIssue({ code: "custom", path: ["tradeOther"], message: "Type your trade" });
  if (v.trade !== OTHER_TRADE && !z.uuid().safeParse(v.trade).success) ctx.addIssue({ code: "custom", path: ["trade"], message: "Choose your trade" });
});
export type CvSubmissionInput = z.output<typeof cvSubmissionSchema>;

/** Stage change (and/or the note shown to the candidate on /status; blank clears it). Old status values are accepted. */
export const cvSubmissionStatusSchema = z.object({
  id: f.uuid(),
  status: z.preprocess(statusValue, f.enumOf(CV_SUBMISSION_STATUS_VALUES)),
  candidateNote: z.string().trim().max(500, "Keep the note under 500 characters").optional(),
});

/** Public /status lookup: mobile number + reference (VSG-CV-000123). */
export const cvStatusLookupSchema = z.object({
  phone: f.phone(),
  reference: z
    .string({ error: "Enter your reference" })
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^VSG-CV-\d{4,10}$/, "Enter the reference exactly as we sent it, for example VSG-CV-000123")),
});

/** Staff-only remarks (replaces the whole text; blank clears it). */
export const cvSubmissionRemarksSchema = z.object({
  id: f.uuid(),
  remarks: f.optionalText(4000),
});

export const cvSubmissionFiltersSchema = z.object({
  status: z.preprocess(statusValue, z.enum(CV_SUBMISSION_STATUS_VALUES).optional()).catch(undefined),
  /** "1" = passport expiring within 6 months (or already expired). */
  expiring: z.preprocess((v) => (v === "1" || v === true ? true : undefined), z.literal(true).optional()),
  trade: z.uuid().optional().catch(undefined),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  /** Name, reference, trade, phone digits, email, requirement; 4 letters/digits also match the passport's last 4, a full passport number its blind index. */
  q: z.string().trim().max(100).optional().catch(undefined),
  /** Requirement poster (cms_entries id) the candidate applied for. */
  requirement: z.uuid().optional().catch(undefined),
  source: z.enum(CV_SUBMISSION_SOURCE_VALUES).optional().catch(undefined),
  /** "yes" = a CV file is attached, "no" = applied without one (ask on WhatsApp). */
  cv: z.enum(["yes", "no"]).optional().catch(undefined),
});
export type CvSubmissionFilters = z.output<typeof cvSubmissionFiltersSchema>;

/** Search-param keys of the list filters (list page, applicants page, Excel download). */
export const CV_SUBMISSION_FILTER_KEYS = ["q", "status", "trade", "country", "expiring", "requirement", "source", "cv"] as const;

/** Result returned to the public form after a successful submission. */
export type CvSubmissionResult = {
  /** Reference code (null when the request was dropped as spam: the visitor still sees the confirmation). */
  code: string | null;
  name: string;
  trade: string;
  requirementTitle: string | null;
  /** A CV file came with the application (false: the candidate sends it later on WhatsApp). */
  hasCv: boolean;
  /**
   * Short-lived signed link token for "Add your documents now (optional)" (null when dropped as spam). Valid for
   * CV_DOCUMENT_CANDIDATE_LINK_HOURS; staff can send a fresh 7-day link from the Command Centre.
   */
  uploadToken: string | null;
};

/** What the public /status page shows (nothing else leaves the server). */
export type CvStatusView = {
  /** "R. K." — initials only. */
  initials: string;
  trade: string;
  status: CvSubmissionStatus;
  /** The journey stage reached (the current status, or the last journey stage before on hold / not suitable). */
  journeyStage: CvSubmissionStatus;
  /** Date each journey stage was (last) reached, ISO strings; absent stages were not reached. */
  stageDates: Partial<Record<CvSubmissionStatus, string>>;
  /** Staff note meant for the candidate (never the staff remarks). */
  note: string | null;
  /** We hold a CV file for this application (false: ask the candidate to send it on WhatsApp). */
  hasCv: boolean;
  /** The reference the candidate typed (for the prefilled WhatsApp message). */
  reference: string;
  updatedAt: string;
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
