import "server-only";

import { formatExportDateTime, type XlsxColumn } from "@/lib/xlsx-export";
import { CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import type { CvSubmissionExportRow } from "@/modules/operations/cv-submissions";

import { formatEmail, formatPassport, formatPhone, type ExportVisibility } from "./people";

/**
 * Columns of the CV submissions / applicants Excel download, in the order the business asked for. S.No is added by
 * buildXlsx as the first column. Two columns follow the requested ones so nothing the older download had is lost:
 * the total years (the only figure for people who applied before experience was split into abroad and India, and
 * for imported sheets that had one experience column) and the reference (VSG-CV-000123, which candidates quote on
 * WhatsApp and on /status). Masking: phone and email need candidates.view_contact, the full passport number
 * candidates.view_documents (else XXXX1234).
 */
export const CV_SUBMISSION_EXPORT_HEADERS = [
  "Name",
  "Trade",
  "Passport No",
  "Exp Abroad (yrs)",
  "Exp India (yrs)",
  "Email",
  "Phone",
  "Applied for",
  "Applied on",
  "Status",
  "Preferred country",
  "Passport expiry",
  "Candidate notes",
  "Staff remarks",
  "Total exp (yrs)",
  "Reference",
] as const;

type Header = (typeof CV_SUBMISSION_EXPORT_HEADERS)[number];

export function cvSubmissionExportColumns(visibility: ExportVisibility): XlsxColumn<CvSubmissionExportRow>[] {
  const byHeader: Record<Header, Omit<XlsxColumn<CvSubmissionExportRow>, "header">> = {
    Name: { value: (r) => r.name },
    Trade: { value: (r) => r.tradeLabel },
    "Passport No": { value: (r) => formatPassport(visibility, r.passportEncrypted, r.passportLast4) || (r.hasPassport === true ? "Has passport" : r.hasPassport === false ? "No passport" : "") },
    "Exp Abroad (yrs)": { value: (r) => r.experienceAbroadYears },
    "Exp India (yrs)": { value: (r) => r.experienceIndiaYears },
    Email: { value: (r) => formatEmail(visibility, r.email) },
    Phone: { value: (r) => formatPhone(visibility, r.phone) },
    "Applied for": { value: (r) => r.requirementTitle ?? "General (no requirement)" },
    "Applied on": { value: (r) => formatExportDateTime(r.createdAt) },
    Status: { value: (r) => CV_SUBMISSION_STATUS_LABELS[r.status] },
    "Preferred country": { value: (r) => r.countryName ?? "Any" },
    "Passport expiry": { value: (r) => r.passportExpiry ?? "" },
    "Candidate notes": { value: (r) => r.candidateNotes, wrap: true },
    "Staff remarks": { value: (r) => r.staffRemarks, wrap: true },
    "Total exp (yrs)": { value: (r) => r.experienceYears },
    Reference: { value: (r) => r.code },
  };
  return CV_SUBMISSION_EXPORT_HEADERS.map((header) => ({ header, ...byHeader[header] }));
}
