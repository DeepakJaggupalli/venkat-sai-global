/**
 * Excel import of the CVs the office already has (/admin/cv-submissions/import): limits, the template's columns
 * and the shapes shared by the import page and its route handlers (client-safe: no server imports).
 */

/** Same limit as a CV upload: keeps the request under the 4.5 MB body limit. */
export const CV_IMPORT_MAX_BYTES = 4 * 1024 * 1024;
/** People per file (bigger lists are split into several files). */
export const CV_IMPORT_MAX_ROWS = 2000;
export const CV_IMPORT_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const CV_IMPORT_PATH = "/admin/cv-submissions/import";
export const CV_IMPORT_TEMPLATE_PATH = "/admin/cv-submissions/import/template";
export const CV_IMPORT_CHECK_PATH = "/admin/cv-submissions/import/check";
export const CV_IMPORT_RUN_PATH = "/admin/cv-submissions/import/run";
/** The CV list filtered to imported rows (the summary links here). */
export const CV_IMPORT_LIST_HREF = "/admin/cv-submissions?source=import";

/** privacyNoticeVersion of imported rows (they never saw the website's notice; staff confirmed consent). */
export const CV_IMPORT_PRIVACY_NOTICE_VERSION = "staff-import";
export const CV_IMPORT_CONSENT_LABEL = "These people gave us their CV and agreed that we contact them about jobs";

/** Row 1 of the template's "CVs" sheet, in order. Name, Phone and Trade are required (marked *). */
export const CV_IMPORT_TEMPLATE_HEADERS = [
  "S.No",
  "Name*",
  "Phone*",
  "Trade*",
  "Passport No",
  "Passport Expiry (DD-MM-YYYY)",
  "Exp Abroad (yrs)",
  "Exp India (yrs)",
  "Email",
  "Preferred Country",
  "Remarks",
] as const;

/** Columns the import understands. `experienceTotal` and `candidateNotes` come from the site's own CV Excel download. */
export type CvImportField =
  | "name"
  | "phone"
  | "trade"
  | "passportNumber"
  | "passportExpiry"
  | "experienceAbroad"
  | "experienceIndia"
  | "experienceTotal"
  | "email"
  | "country"
  | "remarks"
  | "candidateNotes";

export const CV_IMPORT_FIELD_LABELS: Record<CvImportField, string> = {
  name: "Name",
  phone: "Phone",
  trade: "Trade",
  passportNumber: "Passport No",
  passportExpiry: "Passport Expiry",
  experienceAbroad: "Exp Abroad",
  experienceIndia: "Exp India",
  experienceTotal: "Experience (total)",
  email: "Email",
  country: "Preferred Country",
  remarks: "Remarks",
  candidateNotes: "Candidate notes",
};

/**
 * ready = will be added; problem = something must be fixed in the file first; duplicate = the same person is higher
 * up in the file; exists = already in the CV list (same phone, or same passport number for staff who may see passport
 * numbers). Only "ready" rows are imported.
 */
export type CvImportRowStatus = "ready" | "problem" | "duplicate" | "exists";

/** One row as the check screen shows it (no full passport number, nothing the file did not contain). */
export type CvImportRowView = {
  /** Row number in Excel. */
  row: number;
  name: string;
  /** E.164 when it could be read, else the text in the file (shortened). */
  phone: string | null;
  trade: string;
  /** The trade matched one of our trades (else it is saved as typed). */
  tradeListed: boolean;
  passportLast4: string | null;
  status: CvImportRowStatus;
  /** Why the row will be skipped (problem / duplicate / exists). */
  reasons: string[];
  /** The row is imported, but something was left blank or changed. */
  notes: string[];
};

export type CvImportCounts = { ready: number; problem: number; duplicate: number; exists: number };

/** Result of "Check file" (step 3). Lists are capped at CV_IMPORT_PREVIEW_LIMIT rows each; counts are complete. */
export type CvImportPreview = {
  fileName: string;
  /** SHA-256 of the checked file: the import refuses a different file. */
  fileHash: string;
  sheetName: string;
  headerRow: number;
  /** Other sheets of the file that also hold a list of people: they are not read. */
  otherSheets: string[];
  columnsUsed: { header: string; field: CvImportField; label: string }[];
  columnsNotUsed: string[];
  /**
   * Passport numbers were compared with the CV list. Only for staff who may see passport numbers
   * (candidates.view_documents): for others a match would confirm a number they cannot see. Phones are always compared.
   */
  passportsCompared: boolean;
  /** People found in the file (blank rows are not counted). */
  totalRows: number;
  counts: CvImportCounts;
  /** Ready rows with a note (something left blank or saved as typed). */
  withNotes: number;
  rows: Record<CvImportRowStatus, CvImportRowView[]>;
  previewLimit: number;
};

/** Result of "Import" (step 4). */
export type CvImportResult = {
  batchId: string;
  fileName: string;
  totalRows: number;
  created: number;
  skipped: number;
  counts: CvImportCounts;
  listHref: string;
};

export const CV_IMPORT_PREVIEW_LIMIT = 200;
