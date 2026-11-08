/**
 * Print model shared by the DOCX and PDF resume renderers (pure). It fixes the business's layout: which rows
 * appear, in what order, with which labels and formatted values. `null` details produce the blank template
 * (every value empty, empty table rows to write in by hand).
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { experienceMonths, formatDateDots, formatExperienceTotal, periodTo } from "../experience";
import type { ExperienceRow, ResumeDetails } from "../schemas";

export type ResumeLabelRow = { label: string; value: string };

export type ResumeExperienceRow = { sl: string; organisation: string; from: string; to: string; designation: string };

export type ResumeExperienceSection = {
  key: "abroad" | "india";
  title: string;
  /** Formatted total ("03 Years 1 Month" / "08 YEARS"); "" when none or blank template. */
  total: string;
  rows: ResumeExperienceRow[];
};

export type ResumeDeclaration = { heading: string; text: string; place: string; date: string; name: string };

export type ResumeModel = {
  blank: boolean;
  title: string;
  /** Candidate name ("" for the blank template). */
  name: string;
  rows: ResumeLabelRow[];
  passportTitle: string;
  passportHeaders: [string, string, string, string];
  passportValues: [string, string, string, string];
  experienceHeaders: { sl: string; organisation: string; period: string; from: string; to: string; designation: string };
  experience: ResumeExperienceSection[];
  declaration: ResumeDeclaration | null;
};

export const BLANK_EXPERIENCE_ROWS = 3;

export const DECLARATION_TEXT = "I hereby declare that the information given above is true to the best of my knowledge and belief.";

/** "+919494263388" → "+91 94942 63388" (unparseable numbers are shown as typed). */
export function formatPhoneInternational(phone: string | null | undefined): string {
  if (!phone) return "";
  const parsed = parsePhoneNumberFromString(phone);
  return parsed ? parsed.formatInternational() : phone;
}

function experienceRows(rows: readonly ExperienceRow[]): ResumeExperienceRow[] {
  return rows.map((row, i) => ({
    sl: String(i + 1),
    organisation: [row.organisation, row.location].filter((v) => v && v.trim()).join(", "),
    from: formatDateDots(row.from),
    to: periodTo(row),
    designation: row.designation,
  }));
}

function blankRows(): ResumeExperienceRow[] {
  return Array.from({ length: BLANK_EXPERIENCE_ROWS }, () => ({ sl: "", organisation: "", from: "", to: "", designation: "" }));
}

const ABROAD_TITLE = "Experience in Abroad :";
const INDIA_TITLE = "EXPERIENCE IN INDIA:";

export function buildResumeModel(details: ResumeDetails | null, opts: { today?: Date } = {}): ResumeModel {
  const today = opts.today ?? new Date();
  const common = {
    title: "RESUME",
    passportTitle: "Passport Details :",
    passportHeaders: ["PASSPORT NO.", "DATE OF ISSUE", "DATE OF EXPIRY", "PLACE OF ISSUE"] as [string, string, string, string],
    experienceHeaders: { sl: "SL.NO", organisation: "Name of Organization", period: "Period of Service", from: "From", to: "To", designation: "Designation" },
  };

  if (!details) {
    const labels = [
      "POST APPLIED FOR",
      "NAME",
      "FATHER NAME",
      "DATE OF BIRTH",
      "MARITAL STATUS",
      "EDUCATION QUALIFICATION",
      "TECHNICAL QUALIFICATION",
      "NATIONALITY",
      "RELIGION",
      "LANGUAGES",
      "PERMANENT ADDRESS",
      "CONTACT",
      "EMAIL ID",
    ];
    return {
      ...common,
      blank: true,
      name: "",
      rows: labels.map((label) => ({ label, value: "" })),
      passportValues: ["", "", "", ""],
      experience: [
        { key: "abroad", title: ABROAD_TITLE, total: "", rows: blankRows() },
        { key: "india", title: INDIA_TITLE, total: "", rows: blankRows() },
      ],
      declaration: { heading: "DECLARATION", text: DECLARATION_TEXT, place: "", date: "", name: "" },
    };
  }

  const contact = [formatPhoneInternational(details.contactPhone), formatPhoneInternational(details.alternatePhone)].filter(Boolean).join(" / ");
  const rows: (ResumeLabelRow | null)[] = [
    { label: "POST APPLIED FOR", value: details.postAppliedFor },
    { label: "NAME", value: details.name },
    { label: "FATHER NAME", value: details.fatherName ?? "" },
    { label: "DATE OF BIRTH", value: formatDateDots(details.dateOfBirth) },
    { label: "MARITAL STATUS", value: details.maritalStatus ?? "" },
    { label: "EDUCATION QUALIFICATION", value: details.educationQualification ?? "" },
    { label: "TECHNICAL QUALIFICATION", value: details.technicalQualification ?? "" },
    { label: "NATIONALITY", value: details.nationality ?? "" },
    details.religion?.trim() ? { label: "RELIGION", value: details.religion } : null,
    { label: "LANGUAGES", value: details.languages ?? "" },
    { label: "PERMANENT ADDRESS", value: (details.permanentAddress ?? "").replace(/\r\n?/g, "\n") },
    { label: "CONTACT", value: contact },
    { label: "EMAIL ID", value: details.email ?? "" },
  ];

  const experience: ResumeExperienceSection[] = [];
  if (details.abroadExperience.length) {
    experience.push({
      key: "abroad",
      title: ABROAD_TITLE,
      total: formatExperienceTotal(experienceMonths(details.abroadExperience, today), "title"),
      rows: experienceRows(details.abroadExperience),
    });
  }
  if (details.indiaExperience.length) {
    experience.push({
      key: "india",
      title: INDIA_TITLE,
      total: formatExperienceTotal(experienceMonths(details.indiaExperience, today), "upper"),
      rows: experienceRows(details.indiaExperience),
    });
  }

  const p = details.passport;
  return {
    ...common,
    blank: false,
    name: details.name,
    rows: rows.filter((r): r is ResumeLabelRow => r !== null),
    passportValues: [p.number ?? "", formatDateDots(p.dateOfIssue), formatDateDots(p.dateOfExpiry), p.placeOfIssue ?? ""],
    experience,
    declaration: details.declaration.include ? { heading: "DECLARATION", text: DECLARATION_TEXT, place: details.declaration.place ?? "", date: "", name: details.name } : null,
  };
}
