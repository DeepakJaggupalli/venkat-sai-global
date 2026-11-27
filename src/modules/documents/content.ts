/**
 * Client-safe: document kinds, labels, the editable content schema and the default wording for each kind.
 * The default wording is only a draft: staff read and edit every line before approving (the documents are signed
 * in the business's name). Pronoun-free on purpose (the person's first name is used instead of he / she).
 */
import { z } from "zod";

import { BRAND } from "@/config/site";
import type { InternStatus, IssuedDocumentKind, IssuedDocumentOrigin, IssuedDocumentStatus } from "@/db/schema/issued-documents";

export type { InternStatus, IssuedDocumentKind, IssuedDocumentOrigin, IssuedDocumentStatus };

/** Mirrors of the schema arrays (type-only schema imports keep this file client-safe; parity is checked below). */
export const ISSUED_DOCUMENT_KINDS = ["course_certificate", "internship_offer_letter", "internship_certificate", "recommendation_letter"] as const satisfies readonly IssuedDocumentKind[];
export const ISSUED_DOCUMENT_STATUSES = ["pending", "approved", "rejected", "revoked"] as const satisfies readonly IssuedDocumentStatus[];
export const INTERN_STATUSES = ["applied", "active", "completed", "dropped", "rejected"] as const satisfies readonly InternStatus[];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const parity: [
  Same<(typeof ISSUED_DOCUMENT_KINDS)[number], IssuedDocumentKind>,
  Same<(typeof ISSUED_DOCUMENT_STATUSES)[number], IssuedDocumentStatus>,
  Same<(typeof INTERN_STATUSES)[number], InternStatus>,
] = [true, true, true];
void parity;

export const INTERN_STATUS_LABELS: Record<InternStatus, string> = {
  applied: "Applied",
  active: "Doing the internship",
  completed: "Completed",
  dropped: "Left early",
  rejected: "Not selected",
};

export const DOCUMENTS_ADMIN_PATH = "/admin/documents";
export const INTERNSHIPS_ADMIN_PATH = "/admin/documents/internships";

export const DOCUMENT_KIND_LABELS: Record<IssuedDocumentKind, string> = {
  course_certificate: "Course completion certificate",
  internship_offer_letter: "Internship offer letter",
  internship_certificate: "Internship certificate",
  recommendation_letter: "Letter of recommendation (LOR)",
};

export const DOCUMENT_STATUS_LABELS: Record<IssuedDocumentStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
};

export const DOCUMENT_STATUS_TONE: Record<IssuedDocumentStatus, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  revoked: "neutral",
};

export const DOCUMENT_ORIGIN_LABELS: Record<IssuedDocumentOrigin, string> = {
  auto: "Created automatically",
  requested: "Requested by the person",
  staff: "Made by staff",
};

/** Certificates print in landscape with a border; letters print in portrait on a letterhead. */
export function isCertificateKind(kind: IssuedDocumentKind): boolean {
  return kind === "course_certificate" || kind === "internship_certificate";
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
  .optional()
  .or(z.literal("").transform(() => undefined));
const line = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);
const optionalLine = (max: number) =>
  line(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Every printed line. Stored as JSON on issued_documents.content and validated on every write. */
export const documentContentSchema = z.object({
  title: line(80).min(3, "Enter the heading"),
  holderName: line(120).min(2, "Enter the name as it should be printed"),
  programme: line(160).min(2, "Enter the course or internship name"),
  role: optionalLine(120),
  organisation: line(160).min(2, "Enter the organisation name"),
  startDate: isoDate,
  endDate: isoDate,
  duration: optionalLine(60),
  result: optionalLine(120),
  body: z.string().trim().min(10, "Write the text of the document").max(4000, "Keep the text under 4000 characters"),
  signatoryName: optionalLine(80),
  signatoryTitle: line(80).min(2, "Enter the signatory's title, e.g. Director"),
  place: line(80).min(2, "Enter the place"),
  issueDate: isoDate,
});
export type DocumentContent = z.infer<typeof documentContentSchema>;

export type DocumentSignatory = { name: string; title: string; place: string };
export const DEFAULT_SIGNATORY: DocumentSignatory = { name: "", title: "Authorised Signatory", place: "Visakhapatnam" };

/** Facts the default wording is built from (all optional except the names). */
export type DocumentFacts = {
  holderName: string;
  programme: string;
  role?: string | null;
  organisation?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  durationHours?: number | null;
  durationWeeks?: number | null;
  online?: boolean;
  result?: string | null;
  /** "This is an unpaid internship." / "You will receive a stipend of …" (already formatted with its currency). */
  stipendSentence?: string | null;
  performanceNote?: string | null;
  /** The LOR is about a course rather than an internship. */
  aboutCourse?: boolean;
};

/** "1 December 2026" (dates are calendar dates, so UTC). */
export function printDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

function durationText(f: DocumentFacts): string | undefined {
  if (f.durationWeeks) return `${f.durationWeeks} week${f.durationWeeks === 1 ? "" : "s"}`;
  if (f.durationHours) return `${f.durationHours} hour${f.durationHours === 1 ? "" : "s"}`;
  return undefined;
}

function period(f: DocumentFacts): string {
  if (f.startDate && f.endDate) return ` from ${printDate(f.startDate)} to ${printDate(f.endDate)}`;
  if (f.startDate) return ` from ${printDate(f.startDate)}`;
  if (f.endDate) return `, ending on ${printDate(f.endDate)}`;
  return "";
}

const TITLES: Record<IssuedDocumentKind, string> = {
  course_certificate: "Certificate of Completion",
  internship_offer_letter: "Internship Offer Letter",
  internship_certificate: "Internship Certificate",
  recommendation_letter: "Letter of Recommendation",
};

function defaultBody(kind: IssuedDocumentKind, f: DocumentFacts, org: string, duration: string | undefined): string {
  const name = f.holderName.trim();
  const first = firstName(name);
  const asRole = f.role ? ` as ${f.role}` : "";
  const mode = f.online ? " online" : "";
  // The programme name is quoted, so "the online internship programme “Welding inspection internship”" still reads well.
  const programme = `“${f.programme}”`;
  switch (kind) {
    case "course_certificate":
      return `has successfully completed the${mode} course ${programme}${duration ? ` (${duration})` : ""} conducted by ${org}${period(f)}.`;
    case "internship_certificate":
      return `has successfully completed the${mode} internship programme ${programme}${asRole} with ${org}${period(f)}${duration ? ` (${duration})` : ""}. During the internship, ${first} showed sincerity, discipline and a willingness to learn. We wish ${first} every success in the future.`;
    case "internship_offer_letter":
      return [
        `Dear ${name},`,
        `We are pleased to offer you a place in our${mode} internship programme ${programme}${asRole} with ${org}. The internship will run${period(f) || " for the period we discussed"}${duration ? ` (${duration})` : ""}.`,
        f.stipendSentence ?? "",
        "During the internship you will work on real tasks with our team and learn on the job. When you complete the internship successfully you will receive an internship certificate.",
        "Please confirm that you accept this offer by replying to this letter or by messaging us on WhatsApp. We look forward to working with you.",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "recommendation_letter":
      return [
        "To whom it may concern,",
        f.aboutCourse
          ? `It is a pleasure to recommend ${name}, who completed the${mode} course ${programme} with ${org}${period(f)}${f.result ? ` with the result: ${f.result}` : ""}.`
          : `It is a pleasure to recommend ${name}, who completed the${mode} internship programme ${programme}${asRole} with ${org}${period(f)}.`,
        f.performanceNote?.trim() ||
          `During this time ${first} completed the work given on time, learned quickly and worked well with the team.`,
        `I recommend ${first} for further studies and for employment, and wish ${first} every success.`,
        "Please contact us if you need any more information.",
      ].join("\n\n");
  }
}

/** The draft every new document starts from. */
export function defaultDocumentContent(kind: IssuedDocumentKind, facts: DocumentFacts, signatory: DocumentSignatory): DocumentContent {
  const organisation = facts.organisation?.trim() || BRAND.legalEntity;
  const duration = durationText(facts);
  return {
    title: TITLES[kind],
    holderName: facts.holderName.trim(),
    programme: facts.programme.trim(),
    role: facts.role?.trim() || undefined,
    organisation,
    startDate: facts.startDate ?? undefined,
    endDate: facts.endDate ?? undefined,
    duration,
    result: facts.result?.trim() || undefined,
    body: defaultBody(kind, facts, organisation, duration),
    signatoryName: signatory.name.trim() || undefined,
    signatoryTitle: signatory.title.trim() || DEFAULT_SIGNATORY.title,
    place: signatory.place.trim() || DEFAULT_SIGNATORY.place,
    issueDate: undefined,
  };
}

/** Parses stored content; falls back to a minimal valid shape so an old or damaged row still opens for editing. */
export function parseDocumentContent(value: unknown, fallback: { holderName: string; kind: IssuedDocumentKind }): DocumentContent {
  const parsed = documentContentSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const v = (value ?? {}) as Partial<Record<keyof DocumentContent, unknown>>;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    title: s(v.title) || TITLES[fallback.kind],
    holderName: s(v.holderName) || fallback.holderName,
    programme: s(v.programme) || "",
    role: s(v.role) || undefined,
    organisation: s(v.organisation) || BRAND.legalEntity,
    startDate: s(v.startDate) || undefined,
    endDate: s(v.endDate) || undefined,
    duration: s(v.duration) || undefined,
    result: s(v.result) || undefined,
    body: s(v.body) || "",
    signatoryName: s(v.signatoryName) || undefined,
    signatoryTitle: s(v.signatoryTitle) || DEFAULT_SIGNATORY.title,
    place: s(v.place) || DEFAULT_SIGNATORY.place,
    issueDate: s(v.issueDate) || undefined,
  };
}

/** Which kinds a person may ask for, by what they finished. */
export const REQUESTABLE_KINDS: { internship: IssuedDocumentKind[]; course: IssuedDocumentKind[] } = {
  internship: ["internship_offer_letter", "internship_certificate", "recommendation_letter"],
  course: ["course_certificate", "recommendation_letter"],
};
