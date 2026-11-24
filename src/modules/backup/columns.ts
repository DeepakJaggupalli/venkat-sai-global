import "server-only";

import type { CmsEntryStatus, EmployerKind, OrgStatus, OrgType } from "@/db/schema";
import type { BookingSlotKind, BookingSlotStatus, SlotBookingSource, SlotBookingStatus } from "@/db/schema/bookings";
import type { CvSubmissionSource, CvSubmissionStatus } from "@/db/schema/cv-submissions";
import type { ReferrerStatus } from "@/db/schema/referrals";
import type { WorkerReviewStatus } from "@/db/schema/worker-reviews";
import { formatMoney, humanize, maskEmail, maskPhone } from "@/lib/format";
import { maskPassportNumber, type XlsxColumn } from "@/lib/xlsx-export";
import { BOOKING_KIND_LABELS, BOOKING_STATUS_LABELS, SLOT_STATUS_LABELS } from "@/modules/bookings/schemas";
import { CMS_ENTRY_STATUS_LABELS } from "@/modules/content/constants";
import { ENQUIRY_STATUS_LABELS, ENQUIRY_TYPE_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, LEAD_TYPE_LABELS, REQUIREMENT_STATUS_LABELS } from "@/modules/operations/constants";
import { CV_SUBMISSION_SOURCE_LABELS, CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import { ORG_TYPE_LABELS } from "@/modules/organizations/constants";
import { EMPLOYER_KIND_LABELS } from "@/modules/organizations/employer-kind";
import { REFERRER_STATUS_LABELS } from "@/modules/referrals/schemas";
import { RESUME_REQUEST_STATUS_LABELS, type ResumeRequestStatus } from "@/modules/resume-service/schemas";
import { WORKER_REVIEW_STATUS_LABELS } from "@/modules/worker-reviews/schemas";

/**
 * Row shapes and columns of every backup sheet (no database access; queries.ts fills the rows). Plain words for the
 * owner, the same masking rules as the other staff downloads:
 *   fullPassport  the full passport number (the row carries it decrypted only when allowed), else XXXX1234
 *   fullContact   people's phone numbers and emails in full, else masked (98•••43210, r***@gmail.com)
 * Money always shows its own currency (formatMoney); nothing is ever converted or assumed.
 */

export type BackupVisibility = { fullPassport: boolean; fullContact: boolean };

const phone = (v: BackupVisibility, value: string | null | undefined): string => (value ? (v.fullContact ? value : maskPhone(value)) : "");
const email = (v: BackupVisibility, value: string | null | undefined): string => (value ? (v.fullContact ? value : maskEmail(value)) : "");
const yesNo = (value: boolean | null | undefined): string => (value === true ? "Yes" : value === false ? "No" : "");

/** Full number when allowed and known, else XXXX1234, else what the person said about having one. */
export function passportCell(v: BackupVisibility, row: { passportFull: string | null; passportLast4: string | null; hasPassport?: boolean | null }): string {
  const value = v.fullPassport && row.passportFull ? row.passportFull : maskPassportNumber(row.passportLast4);
  if (value) return value;
  return row.hasPassport === true ? "Has passport" : row.hasPassport === false ? "No passport" : "";
}

// ---------------------------------------------------------------------------
// CV submissions and applicants
// ---------------------------------------------------------------------------

export type CvBackupRow = {
  code: string;
  name: string;
  phone: string;
  email: string | null;
  tradeLabel: string;
  experienceYears: number | null;
  experienceAbroadYears: number | null;
  experienceIndiaYears: number | null;
  countryName: string | null;
  requirementTitle: string | null;
  status: CvSubmissionStatus;
  source: CvSubmissionSource;
  createdAt: Date;
  passportExpiry: string | null;
  hasPassport: boolean | null;
  passportLast4: string | null;
  /** Decrypted only when the caller may see full passport numbers; null otherwise. */
  passportFull: string | null;
  candidateNotes: string | null;
  staffRemarks: string | null;
  hasCv: boolean;
  referralCode: string | null;
  placedWith: string | null;
};

/**
 * The columns the business asked for, in this order (S.No is added by the workbook): Name, Trade, Passport No,
 * Exp Abroad, Exp India, Email, Phone, Applied for, Status, Source, Applied on, Preferred country, Passport expiry,
 * Candidate notes, Staff remarks, Code. Then what a restore also needs: total years (the only figure for older and
 * imported rows), whether a CV file is attached, the referral code and the company the worker was placed with.
 */
export const CV_BACKUP_HEADERS = [
  "Name",
  "Trade",
  "Passport No",
  "Exp Abroad (yrs)",
  "Exp India (yrs)",
  "Email",
  "Phone",
  "Applied for",
  "Status",
  "Source",
  "Applied on",
  "Preferred country",
  "Passport expiry",
  "Candidate notes",
  "Staff remarks",
  "Code",
  "Total exp (yrs)",
  "CV file",
  "Referral code",
  "Placed with",
] as const;

export function cvBackupColumns(v: BackupVisibility): XlsxColumn<CvBackupRow>[] {
  const byHeader: Record<(typeof CV_BACKUP_HEADERS)[number], Omit<XlsxColumn<CvBackupRow>, "header">> = {
    Name: { value: (r) => r.name },
    Trade: { value: (r) => r.tradeLabel },
    "Passport No": { value: (r) => passportCell(v, r) },
    "Exp Abroad (yrs)": { value: (r) => r.experienceAbroadYears },
    "Exp India (yrs)": { value: (r) => r.experienceIndiaYears },
    Email: { value: (r) => email(v, r.email) },
    Phone: { value: (r) => phone(v, r.phone) },
    "Applied for": { value: (r) => r.requirementTitle ?? "General (no requirement)" },
    Status: { value: (r) => CV_SUBMISSION_STATUS_LABELS[r.status] ?? humanize(r.status) },
    Source: { value: (r) => CV_SUBMISSION_SOURCE_LABELS[r.source] ?? humanize(r.source) },
    "Applied on": { value: (r) => r.createdAt },
    "Preferred country": { value: (r) => r.countryName ?? "Any" },
    "Passport expiry": { value: (r) => r.passportExpiry ?? "" },
    "Candidate notes": { value: (r) => r.candidateNotes, wrap: true },
    "Staff remarks": { value: (r) => r.staffRemarks, wrap: true },
    Code: { value: (r) => r.code },
    "Total exp (yrs)": { value: (r) => r.experienceYears },
    "CV file": { value: (r) => (r.hasCv ? "Yes" : "No") },
    "Referral code": { value: (r) => r.referralCode },
    "Placed with": { value: (r) => r.placedWith },
  };
  return CV_BACKUP_HEADERS.map((header) => ({ header, ...byHeader[header] }));
}

// ---------------------------------------------------------------------------
// Requirement posters
// ---------------------------------------------------------------------------

export type PosterBackupRow = {
  title: string;
  countryName: string | null;
  trades: string[];
  status: CmsEntryStatus;
  publishedAt: Date | null;
  applicants: number;
  link: string;
  createdAt: Date;
};

export function posterBackupColumns(): XlsxColumn<PosterBackupRow>[] {
  return [
    { header: "Title", value: (r) => r.title },
    { header: "Country", value: (r) => r.countryName ?? "" },
    { header: "Trades", value: (r) => r.trades.join(", "), wrap: true },
    { header: "Status", value: (r) => CMS_ENTRY_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "Published on", value: (r) => r.publishedAt },
    { header: "Applicants", value: (r) => r.applicants },
    { header: "Web link", value: (r) => (r.status === "published" ? r.link : "") },
    { header: "Created on", value: (r) => r.createdAt },
  ];
}

// ---------------------------------------------------------------------------
// Job applications (people with a website account)
// ---------------------------------------------------------------------------

export type ApplicationBackupRow = {
  code: string;
  candidateName: string;
  phone: string | null;
  email: string | null;
  jobTitle: string;
  jobCode: string;
  company: string | null;
  stage: string | null;
  status: string;
  source: string;
  createdAt: Date;
};

export function applicationBackupColumns(v: BackupVisibility): XlsxColumn<ApplicationBackupRow>[] {
  return [
    { header: "Candidate", value: (r) => r.candidateName },
    { header: "Phone", value: (r) => phone(v, r.phone) },
    { header: "Email", value: (r) => email(v, r.email) },
    { header: "Job", value: (r) => r.jobTitle },
    { header: "Job code", value: (r) => r.jobCode },
    { header: "Company", value: (r) => r.company ?? "" },
    { header: "Stage", value: (r) => r.stage ?? "" },
    { header: "Status", value: (r) => humanize(r.status) },
    { header: "Source", value: (r) => humanize(r.source) },
    { header: "Applied on", value: (r) => r.createdAt },
    { header: "Code", value: (r) => r.code },
  ];
}

// ---------------------------------------------------------------------------
// Manpower requests (workforce requirements from companies, agencies and the website)
// ---------------------------------------------------------------------------

export type ManpowerRequestBackupRow = {
  code: string;
  title: string;
  status: keyof typeof REQUIREMENT_STATUS_LABELS;
  source: string;
  organizationName: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  countryName: string | null;
  locations: string | null;
  totalPositions: number;
  joiningBy: string | null;
  createdAt: Date;
};

export function manpowerRequestBackupColumns(v: BackupVisibility): XlsxColumn<ManpowerRequestBackupRow>[] {
  return [
    { header: "Title", value: (r) => r.title },
    { header: "Status", value: (r) => REQUIREMENT_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "Company / agency", value: (r) => r.organizationName ?? "" },
    { header: "Contact person", value: (r) => r.contactName },
    { header: "Phone", value: (r) => phone(v, r.contactPhone) },
    { header: "Email", value: (r) => email(v, r.contactEmail) },
    { header: "Country", value: (r) => r.countryName ?? "" },
    { header: "Work sites", value: (r) => r.locations, wrap: true },
    { header: "Workers needed", value: (r) => r.totalPositions },
    { header: "Joining by", value: (r) => r.joiningBy ?? "" },
    { header: "Came from", value: (r) => humanize(r.source) },
    { header: "Received on", value: (r) => r.createdAt },
    { header: "Code", value: (r) => r.code },
  ];
}

// ---------------------------------------------------------------------------
// Bookings: dates (slots) and the people booked on them
// ---------------------------------------------------------------------------

export type SlotBackupRow = {
  code: string;
  kind: BookingSlotKind;
  title: string;
  trade: string;
  date: string;
  startTime: string;
  endTime: string | null;
  venue: string;
  capacity: number;
  bookedSeats: number;
  status: BookingSlotStatus;
  feeNote: string | null;
  cancelReason: string | null;
  createdAt: Date;
};

export function slotBackupColumns(): XlsxColumn<SlotBackupRow>[] {
  return [
    { header: "Date", value: (r) => r.date },
    { header: "Time", value: (r) => (r.endTime ? `${r.startTime} to ${r.endTime}` : r.startTime) },
    { header: "Type", value: (r) => BOOKING_KIND_LABELS[r.kind] ?? humanize(r.kind) },
    { header: "Title", value: (r) => r.title },
    { header: "Trade", value: (r) => r.trade },
    { header: "Place", value: (r) => r.venue, wrap: true },
    { header: "Seats", value: (r) => r.capacity },
    { header: "Booked", value: (r) => r.bookedSeats },
    { header: "Status", value: (r) => SLOT_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "Fee note", value: (r) => r.feeNote },
    { header: "Cancel reason", value: (r) => r.cancelReason, wrap: true },
    { header: "Code", value: (r) => r.code },
    { header: "Created on", value: (r) => r.createdAt },
  ];
}

export type BookingBackupRow = {
  code: string;
  name: string;
  phone: string;
  email: string | null;
  trade: string;
  organizationName: string | null;
  seats: number;
  status: SlotBookingStatus;
  source: SlotBookingSource;
  notes: string | null;
  slotCode: string;
  slotTitle: string;
  slotDate: string;
  slotStartTime: string;
  createdAt: Date;
};

export function bookingBackupColumns(v: BackupVisibility): XlsxColumn<BookingBackupRow>[] {
  return [
    { header: "Name", value: (r) => r.name },
    { header: "Phone", value: (r) => phone(v, r.phone) },
    { header: "Email", value: (r) => email(v, r.email) },
    { header: "Trade", value: (r) => r.trade },
    { header: "Company / agency", value: (r) => r.organizationName ?? "" },
    { header: "Seats", value: (r) => r.seats },
    { header: "Status", value: (r) => BOOKING_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "For", value: (r) => r.slotTitle },
    { header: "Date", value: (r) => r.slotDate },
    { header: "Time", value: (r) => r.slotStartTime },
    { header: "Booked from", value: (r) => (r.source === "staff" ? "Added by staff" : "Website") },
    { header: "Staff notes", value: (r) => r.notes, wrap: true },
    { header: "Booked on", value: (r) => r.createdAt },
    { header: "Booking code", value: (r) => r.code },
    { header: "Date code", value: (r) => r.slotCode },
  ];
}

// ---------------------------------------------------------------------------
// Referrals: referrers and the rewards paid
// ---------------------------------------------------------------------------

export type ReferrerBackupRow = {
  code: string;
  name: string;
  phone: string;
  email: string | null;
  status: ReferrerStatus;
  referred: number;
  createdAt: Date;
};

export function referrerBackupColumns(v: BackupVisibility): XlsxColumn<ReferrerBackupRow>[] {
  return [
    { header: "Name", value: (r) => r.name },
    { header: "Phone", value: (r) => phone(v, r.phone) },
    { header: "Email", value: (r) => email(v, r.email) },
    { header: "Code", value: (r) => r.code },
    { header: "Status", value: (r) => REFERRER_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "People who sent a CV", value: (r) => r.referred },
    { header: "Joined on", value: (r) => r.createdAt },
  ];
}

export type PayoutBackupRow = {
  cvCode: string;
  cvName: string;
  referrerName: string;
  referrerCode: string;
  amountMinor: number;
  currency: string;
  paidAt: Date;
  paidByName: string | null;
  note: string | null;
};

export function payoutBackupColumns(): XlsxColumn<PayoutBackupRow>[] {
  return [
    { header: "Referrer", value: (r) => r.referrerName },
    { header: "Referrer code", value: (r) => r.referrerCode },
    { header: "Referred person", value: (r) => r.cvName },
    { header: "CV reference", value: (r) => r.cvCode },
    { header: "Amount paid", value: (r) => formatMoney(r.amountMinor, r.currency) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Paid on", value: (r) => r.paidAt },
    { header: "Paid by", value: (r) => r.paidByName ?? "" },
    { header: "Note", value: (r) => r.note, wrap: true },
  ];
}

// ---------------------------------------------------------------------------
// Worker reviews
// ---------------------------------------------------------------------------

export type ReviewBackupRow = {
  displayName: string;
  trade: string;
  countryName: string | null;
  rating: number;
  body: string;
  consentToPublish: boolean;
  status: WorkerReviewStatus;
  cvCode: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

export function reviewBackupColumns(): XlsxColumn<ReviewBackupRow>[] {
  return [
    { header: "Name shown", value: (r) => r.displayName },
    { header: "Trade", value: (r) => r.trade },
    { header: "Country", value: (r) => r.countryName ?? "" },
    { header: "Stars", value: (r) => r.rating },
    { header: "Review", value: (r) => r.body, wrap: true },
    { header: "Allowed on website", value: (r) => yesNo(r.consentToPublish) },
    { header: "Status", value: (r) => WORKER_REVIEW_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "CV reference", value: (r) => r.cvCode ?? "" },
    { header: "Received on", value: (r) => r.createdAt },
    { header: "On the website since", value: (r) => r.publishedAt },
  ];
}

// ---------------------------------------------------------------------------
// Leads and enquiries
// ---------------------------------------------------------------------------

export type LeadBackupRow = {
  code: string;
  type: keyof typeof LEAD_TYPE_LABELS;
  status: keyof typeof LEAD_STATUS_LABELS;
  source: keyof typeof LEAD_SOURCE_LABELS;
  name: string;
  designation: string | null;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
  countryName: string | null;
  city: string | null;
  interest: string | null;
  notes: string | null;
  estimatedValueMinor: number | null;
  estimatedValueCurrency: string | null;
  nextFollowUpAt: Date | null;
  assignedTo: string | null;
  createdAt: Date;
};

export function leadBackupColumns(v: BackupVisibility): XlsxColumn<LeadBackupRow>[] {
  return [
    { header: "Name", value: (r) => r.name },
    { header: "Designation", value: (r) => r.designation },
    { header: "Organisation", value: (r) => r.organizationName },
    { header: "Phone", value: (r) => phone(v, r.phone) },
    { header: "Email", value: (r) => email(v, r.email) },
    { header: "Type", value: (r) => LEAD_TYPE_LABELS[r.type] ?? humanize(r.type) },
    { header: "Status", value: (r) => LEAD_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "Came from", value: (r) => LEAD_SOURCE_LABELS[r.source] ?? humanize(r.source) },
    { header: "Country", value: (r) => r.countryName ?? "" },
    { header: "City", value: (r) => r.city },
    { header: "Interested in", value: (r) => r.interest, wrap: true },
    { header: "Estimated value", value: (r) => (r.estimatedValueMinor !== null && r.estimatedValueCurrency ? formatMoney(r.estimatedValueMinor, r.estimatedValueCurrency) : "") },
    { header: "Next follow-up", value: (r) => r.nextFollowUpAt },
    { header: "Assigned to", value: (r) => r.assignedTo ?? "" },
    { header: "Staff notes", value: (r) => r.notes, wrap: true },
    { header: "Created on", value: (r) => r.createdAt },
    { header: "Code", value: (r) => r.code },
  ];
}

export type EnquiryBackupRow = {
  code: string;
  type: keyof typeof ENQUIRY_TYPE_LABELS;
  status: keyof typeof ENQUIRY_STATUS_LABELS;
  name: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  subject: string | null;
  message: string;
  createdAt: Date;
};

export function enquiryBackupColumns(v: BackupVisibility): XlsxColumn<EnquiryBackupRow>[] {
  return [
    { header: "Name", value: (r) => r.name },
    { header: "Phone", value: (r) => phone(v, r.phone) },
    { header: "Email", value: (r) => email(v, r.email) },
    { header: "Organisation", value: (r) => r.organizationName },
    { header: "About", value: (r) => ENQUIRY_TYPE_LABELS[r.type] ?? humanize(r.type) },
    { header: "Subject", value: (r) => r.subject },
    { header: "Message", value: (r) => r.message, wrap: true },
    { header: "Status", value: (r) => ENQUIRY_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "Received on", value: (r) => r.createdAt },
    { header: "Code", value: (r) => r.code },
  ];
}

// ---------------------------------------------------------------------------
// Organisations (companies, travel agencies, recruitment partners, institutions)
// ---------------------------------------------------------------------------

export type OrganisationBackupRow = {
  name: string;
  type: OrgType;
  employerKind: EmployerKind | null;
  status: OrgStatus;
  email: string | null;
  phone: string | null;
  city: string | null;
  countryName: string | null;
  createdAt: Date;
  /** A demo account made by the demo script (organizations.metadata.demoAccount), not a real business. */
  demo: boolean;
};

/** "Travel agency", "Company / HR", "Recruitment partner", … */
export function organisationTypeLabel(type: OrgType, employerKind: EmployerKind | null): string {
  if (type === "employer" && employerKind) return EMPLOYER_KIND_LABELS[employerKind] ?? ORG_TYPE_LABELS.employer;
  return ORG_TYPE_LABELS[type] ?? humanize(type);
}

/** Business contact details of the organisation itself (not a candidate's), shown as stored. */
export function organisationBackupColumns(): XlsxColumn<OrganisationBackupRow>[] {
  return [
    { header: "Name", value: (r) => r.name },
    { header: "Type", value: (r) => organisationTypeLabel(r.type, r.employerKind) },
    { header: "Status", value: (r) => humanize(r.status) },
    { header: "Phone", value: (r) => r.phone },
    { header: "Email", value: (r) => r.email },
    { header: "City", value: (r) => r.city },
    { header: "Country", value: (r) => r.countryName ?? "" },
    { header: "Joined on", value: (r) => r.createdAt },
    { header: "Demo account", value: (r) => (r.demo ? "Yes (for testing)" : "") },
  ];
}

// ---------------------------------------------------------------------------
// Resume requests ("Prepare my resume")
// ---------------------------------------------------------------------------

export type ResumeRequestBackupRow = {
  code: string;
  name: string;
  phone: string;
  email: string | null;
  status: ResumeRequestStatus;
  passportLast4: string | null;
  passportFull: string | null;
  priceAmountMinor: number | null;
  priceCurrency: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paidAt: Date | null;
  candidateNotes: string | null;
  staffNotes: string | null;
  createdAt: Date;
};

export function resumeRequestBackupColumns(v: BackupVisibility): XlsxColumn<ResumeRequestBackupRow>[] {
  return [
    { header: "Name", value: (r) => r.name },
    { header: "Phone", value: (r) => phone(v, r.phone) },
    { header: "Email", value: (r) => email(v, r.email) },
    { header: "Passport No", value: (r) => passportCell(v, r) },
    { header: "Status", value: (r) => RESUME_REQUEST_STATUS_LABELS[r.status] ?? humanize(r.status) },
    { header: "Price", value: (r) => (r.priceAmountMinor !== null && r.priceAmountMinor > 0 && r.priceCurrency ? formatMoney(r.priceAmountMinor, r.priceCurrency) : "Price on request") },
    { header: "Payment", value: (r) => (r.paymentMethod ? humanize(r.paymentMethod) : "") },
    { header: "Payment reference", value: (r) => r.paymentReference },
    { header: "Paid on", value: (r) => r.paidAt },
    { header: "Candidate notes", value: (r) => r.candidateNotes, wrap: true },
    { header: "Staff notes", value: (r) => r.staffNotes, wrap: true },
    { header: "Requested on", value: (r) => r.createdAt },
    { header: "Code", value: (r) => r.code },
  ];
}
