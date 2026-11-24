import "server-only";

import ExcelJS from "exceljs";

import { ActionError } from "@/lib/actions";
import { last4, normaliseIdentityNumber } from "@/modules/candidates/profile-rules";

import { CV_IMPORT_FIELD_LABELS, CV_IMPORT_MAX_BYTES, CV_IMPORT_MAX_ROWS, type CvImportField, type CvImportRowStatus, type CvImportRowView } from "./cv-import-schemas";
import { CV_MAX_EXPERIENCE_YEARS, cvSubmissionFieldsSchema, totalExperienceYears } from "./cv-submission-schemas";

/**
 * Reading and checking an office Excel list of CVs (pure: no database). The service (cv-import.ts) adds the lookups
 * (trades, countries), the "already in the CV list" check and the insert.
 *
 * Phone, passport, email and name rules are the "Send your CV" form's own (cvSubmissionFieldsSchema), so an imported
 * row is held to the same standard as one sent from the website. Spreadsheet habits are handled before those rules
 * run: numbers stored as numbers, Excel date serials, "Has passport" / "Nil" words, masked values from a list
 * downloaded without the reveal permission, several numbers in one phone cell.
 */

// ---------------------------------------------------------------------------
// Rules shared with the public form
// ---------------------------------------------------------------------------

const formFields = cvSubmissionFieldsSchema.shape;
const nameRule = formFields.name;
const phoneRule = formFields.phone;
const typedTradeRule = formFields.tradeOther;
const emailRule = formFields.email;
const passportRule = formFields.passportNumber;
const passportExpiryRule = formFields.passportExpiry;
const experienceAbroadRule = formFields.experienceAbroadYears;
const experienceIndiaRule = formFields.experienceIndiaYears;

/** Staff remarks: same limit as the remarks box on the CV page. */
export const CV_IMPORT_REMARKS_MAX = 4000;
/** Candidate notes: same limit as "Notes for us" on the form (and the column check). */
export const CV_IMPORT_NOTES_MAX = 1000;

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export type CellPlain = string | number | boolean | Date | null;

/** An exceljs cell value reduced to a plain value (rich text joined, formula → cached result, link → its text). */
export function plainCellValue(value: unknown): CellPlain {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.richText)) {
    return v.richText.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).join("");
  }
  if ("formula" in v || "sharedFormula" in v) return "result" in v ? plainCellValue(v.result) : null;
  if ("error" in v) return null;
  if ("text" in v) return plainCellValue(v.text);
  if (typeof v.hyperlink === "string") return v.hyperlink.replace(/^(mailto|tel):/i, "");
  return null;
}

/** Zero-width spaces and joiners, word joiner, byte-order mark. */
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

/**
 * Text of a plain cell value; numbers without exponent noise, dates as YYYY-MM-DD, TRUE/FALSE as yes/no. The
 * apostrophe our own Excel download puts before text starting with = + - @ (formula protection, neutraliseFormula)
 * is removed, so a downloaded list imports as it was saved.
 */
export function cellText(value: CellPlain): string {
  if (value === null) return "";
  if (typeof value === "string") return value.replace(INVISIBLE, "").replace(/\u00a0/g, " ").replace(/^'(?=[=+\-@\t\r])/, "");
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value.toISOString().slice(0, 10);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function multiLine(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lower-case words only ("N/A" → "n a"), for comparing with word lists. */
function wordKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A value quoted in a message (kept short; it is the staff member's own file). */
function quote(value: string): string {
  const v = oneLine(value);
  return `“${v.length > 40 ? `${v.slice(0, 39)}…` : v}”`;
}

/** Blank in all but name: "-", "NA", "N/A". */
const BLANK_WORDS = new Set(["", "na", "n a", "not applicable", "nan", "null", "x", "nil", "nill", "none", "no", "nothing"]);

// ---------------------------------------------------------------------------
// Header row
// ---------------------------------------------------------------------------

/** "sno" = a serial-number column (read past silently). */
export type HeaderMatch = CvImportField | "sno" | null;

const set = (...words: string[]) => new Set(words);
const NAME_WORDS = set("name", "names");
const NAME_NOT = set("father", "fathers", "mother", "mothers", "spouse", "wife", "husband", "company", "employer", "agent", "agency", "nominee", "guardian", "sponsor", "client", "project", "file", "sheet", "referred", "reference", "user", "son", "brother", "village", "school");
const PASSPORT_WORDS = set("passport", "ppt", "pp");
const PASSPORT_NOT = set("issue", "issued", "doi", "place", "birth", "dob", "type", "status", "copy", "photo", "scan", "file", "name");
const EXPIRY_WORDS = set("expiry", "expire", "expires", "expired", "expiration", "validity", "valid", "upto", "till", "until", "doe");
const OTHER_DOCUMENT = set("visa", "licence", "license", "medical", "id", "iqama", "card", "certificate", "contract", "insurance", "gamca", "police", "pcc", "agreement");
const EXPERIENCE_WORDS = set("experience", "exp", "expr", "exper", "experiance", "expirience", "experince", "exprience", "expereince");
const YEAR_WORDS = set("yrs", "yr", "years", "year");
const ABROAD_WORDS = set("abroad", "overseas", "gulf", "foreign", "outside", "international", "gcc", "uae", "saudi", "ksa", "qatar", "kuwait", "oman", "bahrain", "dubai", "singapore", "malaysia");
const INDIA_WORDS = set("india", "indian", "local", "domestic", "ind", "national");
const TOTAL_WORDS = set("total", "overall");
const EMAIL_WORDS = set("email", "mail", "gmail", "emailid", "mailid");
const PHONE_WORDS = set("phone", "mobile", "mob", "cell", "cellphone", "contact", "whatsapp", "tel", "telephone", "ph", "mobileno", "phoneno", "contactno", "whatsappno");
const PHONE_NOT = set("alternate", "alternative", "alt", "other", "second", "secondary", "emergency", "father", "mother", "home", "landline", "office", "relative", "family", "guardian", "2", "ii", "person", "name");
const TRADE_WORDS = set("trade", "trades", "position", "designation", "category", "job", "skill", "skills", "profession", "occupation", "post", "craft", "role", "specialisation", "specialization", "title");
const TRADE_NOT = set("test", "result", "code", "status", "date", "grade", "level", "salary", "id", "location", "country", "company", "experience", "exp");
const COUNTRY_WORDS = set("country", "countries", "destination", "preferred");
const COUNTRY_NOT = set("code", "current", "present", "native", "home", "birth", "worked", "visited", "nationality", "issue", "state", "city");
const NOTE_WORDS = set("remarks", "remark", "notes", "note", "comments", "comment", "observation", "observations", "feedback");
const CANDIDATE_WORDS = set("candidate", "worker", "applicant");

const hasAny = (tokens: Set<string>, words: Set<string>) => [...tokens].some((t) => words.has(t));

/**
 * Which field a header cell holds, tolerant of small variations: case, "*", "(yrs)", "No." / "Number", glued words
 * ("PassportNo", "MobileNo"), common abbreviations ("Exp", "PPT"). Unknown headers → null (listed as not used).
 */
export function headerField(raw: string): HeaderMatch {
  const trimmed = oneLine(raw);
  if (trimmed === "#") return "sno";
  const text = trimmed
    .toLowerCase()
    .replace(/\(s\)/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/e-mail/g, "email")
    .replace(/\b(passport|mobile|phone|contact|cell|whatsapp|email|mail)(no|num|number|id)\b/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!text || text.length > 60) return null;
  const compact = text.replace(/ /g, "");
  if (/^(s|sl|sr|serial)?(no|nos|num|number)$/.test(compact) || compact === "serial") return "sno";
  const t = new Set(text.split(" "));

  if (hasAny(t, NAME_WORDS)) return hasAny(t, NAME_NOT) ? null : "name";
  if (hasAny(t, PASSPORT_WORDS)) {
    if (hasAny(t, PASSPORT_NOT)) return null;
    return hasAny(t, EXPIRY_WORDS) || t.has("exp") ? "passportExpiry" : "passportNumber";
  }
  if (hasAny(t, EXPIRY_WORDS)) return hasAny(t, OTHER_DOCUMENT) ? null : "passportExpiry";
  const years = hasAny(t, YEAR_WORDS);
  const abroad = hasAny(t, ABROAD_WORDS);
  const india = hasAny(t, INDIA_WORDS);
  if (hasAny(t, EXPERIENCE_WORDS) || (years && (abroad || india || hasAny(t, TOTAL_WORDS))) || compact === "years" || compact === "yrs") {
    if (abroad && india) return null;
    return abroad ? "experienceAbroad" : india ? "experienceIndia" : "experienceTotal";
  }
  if (hasAny(t, EMAIL_WORDS)) return "email";
  if (hasAny(t, PHONE_WORDS)) return hasAny(t, PHONE_NOT) ? null : "phone";
  if (hasAny(t, TRADE_WORDS)) return hasAny(t, TRADE_NOT) ? null : "trade";
  if (hasAny(t, COUNTRY_WORDS)) return hasAny(t, COUNTRY_NOT) ? null : "country";
  if (hasAny(t, NOTE_WORDS)) return hasAny(t, CANDIDATE_WORDS) ? "candidateNotes" : "remarks";
  return null;
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

export type CvImportRawRow = { row: number; values: Partial<Record<CvImportField, CellPlain>> };

export type CvImportSheet = {
  sheetName: string;
  headerRow: number;
  columns: { col: number; header: string; field: CvImportField }[];
  columnsNotUsed: string[];
  rows: CvImportRawRow[];
  /** Workbook uses the 1904 date system (old Mac files): serial dates start in 1904. */
  date1904: boolean;
  /** Other visible sheets that also have a header row and rows under it: they are NOT read (the check screen says so). */
  otherSheets: string[];
};

/** Rows searched for the header row (the site's own Excel download has it on row 3). */
const HEADER_SCAN_ROWS = 30;
const MAX_UNZIPPED_BYTES = 120 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
/** Nodes the import never needs: skipping them keeps memory low (our template's dropdowns alone are 4,000 cells). */
const IGNORED_NODES = ["dataValidations", "conditionalFormatting", "hyperlinks", "drawing", "picture", "legacyDrawing", "extLst", "tableParts", "autoFilter", "pageSetup", "headerFooter", "rowBreaks", "printOptions", "pageMargins", "sheetProtection"];

function fileError(message: string): never {
  throw new ActionError(message, { code: "invalid_file", fieldErrors: { file: [message] } });
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Entries and total uncompressed size from a zip's central directory, without inflating anything (an .xlsx is a zip;
 * a tiny file can unpack to gigabytes). Null when the directory cannot be read (zip64 counts as too large).
 */
export function inspectZip(bytes: Uint8Array): { entries: number; uncompressedBytes: number } | null {
  if (bytes.byteLength < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let i = bytes.byteLength - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const declared = view.getUint16(i + 10, true);
    const size = view.getUint32(i + 12, true);
    const offset = view.getUint32(i + 16, true);
    if (declared === 0xffff || size === 0xffffffff || offset === 0xffffffff) return { entries: declared, uncompressedBytes: Number.POSITIVE_INFINITY };
    if (offset + size > bytes.byteLength) return null;
    let p = offset;
    let entries = 0;
    let total = 0;
    while (p + 46 <= offset + size) {
      if (view.getUint32(p, true) !== 0x02014b50) return null;
      const uncompressed = view.getUint32(p + 24, true);
      if (uncompressed === 0xffffffff) return { entries: entries + 1, uncompressedBytes: Number.POSITIVE_INFINITY };
      total += uncompressed;
      entries += 1;
      p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    }
    return { entries, uncompressedBytes: total };
  }
  return null;
}

function findHeader(sheet: ExcelJS.Worksheet): { row: number; cells: { col: number; header: string; field: HeaderMatch }[] } | null {
  const last = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    const row = sheet.findRow(r);
    if (!row) continue;
    const cells: { col: number; header: string; field: HeaderMatch }[] = [];
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const header = oneLine(cellText(plainCellValue(cell.value)));
      if (header) cells.push({ col, header, field: headerField(header) });
    });
    const fields = new Set(cells.map((c) => c.field));
    if (fields.has("name") && (fields.has("phone") || fields.has("trade"))) return { row: r, cells };
  }
  return null;
}

/**
 * Read the first visible sheet that has a header row (a "Name" cell next to Phone or Trade) within its first 30 rows:
 * our template (header on row 1) or the site's own CV Excel download (title rows first). Blank rows are skipped.
 * Later sheets that also look like CV lists are named in `otherSheets` (not read). Throws ActionError (code
 * invalid_file) with a message for staff when the file cannot be used.
 */
export async function readCvImportWorkbook(bytes: Uint8Array): Promise<CvImportSheet> {
  if (!bytes.byteLength) fileError("The file is empty. Choose your Excel file again.");
  if (bytes.byteLength > CV_IMPORT_MAX_BYTES) fileError("The file is larger than 4 MB. Split it into smaller files of up to 2,000 people.");
  // The same container holds an old .xls file and an .xlsx locked with a password.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    fileError("This is an old Excel file (.xls) or a file locked with a password. Open it in Excel, remove the password if it has one, choose Save As, pick Excel Workbook (.xlsx), then upload the new file.");
  }
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) fileError("This is not an Excel file. Upload an Excel Workbook (.xlsx), for example our template.");
  const zip = inspectZip(bytes);
  if (!zip || zip.entries > MAX_ZIP_ENTRIES || zip.uncompressedBytes > MAX_UNZIPPED_BYTES) {
    fileError("We could not open this file safely. Copy your rows into our template and upload that instead.");
  }

  const workbook = new ExcelJS.Workbook();
  // maxRows / maxCols are read options exceljs supports but does not declare.
  const options = { ignoreNodes: IGNORED_NODES, maxRows: 50_000, maxCols: 300 };
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer, options);
  } catch (error) {
    if (error instanceof Error && /^Max \w+ count/.test(error.message)) fileError("This sheet is too big. Keep up to 2,000 people per file and delete empty rows and columns at the end.");
    fileError("We could not open this file. Open it in Excel, choose Save As, pick Excel Workbook (.xlsx), and try again.");
  }

  const visible = workbook.worksheets.filter((sheet) => !sheet.state || sheet.state === "visible");
  for (const [index, sheet] of visible.entries()) {
    const header = findHeader(sheet);
    if (!header) continue;

    const columns: CvImportSheet["columns"] = [];
    const columnsNotUsed: string[] = [];
    const taken = new Set<CvImportField>();
    for (const c of header.cells) {
      if (c.field === "sno") continue;
      if (c.field === null) columnsNotUsed.push(c.header);
      else if (taken.has(c.field)) columnsNotUsed.push(`${c.header} (second ${CV_IMPORT_FIELD_LABELS[c.field]} column)`);
      else {
        taken.add(c.field);
        columns.push({ col: c.col, header: c.header, field: c.field });
      }
    }
    const missing = (["phone", "trade"] as const).filter((f) => !taken.has(f));
    if (missing.length) {
      const names = missing.map((f) => (f === "phone" ? "Phone" : "Trade")).join(" and ");
      fileError(`We found the Name column but not ${names}. Add ${missing.length > 1 ? "columns" : "a column"} named ${names} (as in our template), then upload again.`);
    }

    const rows: CvImportRawRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= header.row) return;
      const values: CvImportRawRow["values"] = {};
      let filled = false;
      for (const c of columns) {
        const value = plainCellValue(row.getCell(c.col).value);
        if (value === null || (typeof value === "string" && !value.replace(INVISIBLE, "").trim())) continue;
        values[c.field] = value;
        filled = true;
      }
      if (filled) rows.push({ row: rowNumber, values });
    });
    if (!rows.length) fileError("We found the column names but no people under them. Fill one person per row, then upload the file again.");
    if (rows.length > CV_IMPORT_MAX_ROWS) {
      fileError(`This file has ${rows.length.toLocaleString("en-IN")} people. The limit is ${CV_IMPORT_MAX_ROWS.toLocaleString("en-IN")} per file: split it into smaller files.`);
    }
    // Only one sheet is read: name the other sheets that look like CV lists, so nobody thinks they were imported too.
    const otherSheets = visible.slice(index + 1).flatMap((other) => {
      const found = findHeader(other);
      return found && other.rowCount > found.row ? [other.name] : [];
    });
    return { sheetName: sheet.name, headerRow: header.row, columns, columnsNotUsed, rows, date1904: Boolean(workbook.properties?.date1904), otherSheets };
  }
  return fileError("We could not find the column names. Row 1 should have Name, Phone and Trade, as in our template. Download the template and copy your rows into it.");
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** Excel serial day number → YYYY-MM-DD (1900 or 1904 date system). */
export function excelSerialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : null;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const monthOf = (word: string) => MONTHS[word.slice(0, 3).toLowerCase()] ?? null;

/**
 * A typed date → YYYY-MM-DD. Day first, as in India: 15-03-2027, 15/03/27, 15.3.2027, 15 Mar 2027, 15-March-2027;
 * also 2027-03-15 and Mar 15, 2027. A month-first date is accepted only when it cannot be read day first (03/15/2027).
 */
export function parseDateText(text: string): string | null {
  const s = oneLine(text)
    .replace(/(t|\s)\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(z|am|pm)?$/i, "")
    .trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return b > 12 && a <= 12 ? isoDate(fullYear(m[3]!), a, b) : isoDate(fullYear(m[3]!), b, a);
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[-/. ]*([a-z]{3,9})\.?[-/., ]*(\d{4}|\d{2})$/i.exec(s);
  if (m) {
    const month = monthOf(m[2]!);
    return month ? isoDate(fullYear(m[3]!), month, Number(m[1])) : null;
  }
  m = /^([a-z]{3,9})\.?[-/. ]*(\d{1,2})(?:st|nd|rd|th)?,?[-/. ]+(\d{4})$/i.exec(s);
  if (m) {
    const month = monthOf(m[1]!);
    return month ? isoDate(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

/** Passport expiry cell → YYYY-MM-DD through the form's date rule (real date, 2000–2060). */
export function parseExpiryCell(value: CellPlain, date1904 = false): { iso: string | null; problem?: string } {
  if (value === null) return { iso: null };
  const text = oneLine(cellText(value));
  if (!text || BLANK_WORDS.has(wordKey(text)) || /^-+$/.test(text)) return { iso: null };
  const iso = value instanceof Date ? text : typeof value === "number" ? excelSerialToIso(value, date1904) : parseDateText(text);
  const checked = iso ? passportExpiryRule.safeParse(iso) : null;
  if (!checked?.success || !checked.data) {
    return { iso: null, problem: `Passport expiry ${quote(text)} is not a valid date. Write day-month-year, for example 15-03-2027` };
  }
  return { iso: checked.data };
}

/**
 * Phone cell → E.164 through the form's phone rule (Indian numbers without +91 work, as on the form). Also: numbers
 * stored as numbers, "0091…", several numbers in one cell (the first valid one is used), and a number that lost its
 * "+" in Excel (971501234567 → +971501234567, with a note asking staff to check it).
 */
export function parsePhoneCell(value: CellPlain): { phone: string; note?: string } | { problem: string } {
  const raw = typeof value === "number" ? (Number.isSafeInteger(value) && value > 0 ? String(value) : "") : oneLine(cellText(value));
  const text = raw.replace(/^tel:/i, "").trim();
  if (!text || /^-+$/.test(text)) return { problem: "Phone number is missing" };
  if (/[*•]|x{3,}/i.test(text)) return { problem: "Phone number is hidden in this file. Type the full number" };
  const parts = [text, ...text.split(/[/,;|]|\bor\b|\band\b/i).map((p) => p.trim())].filter((p, i, all) => p && all.indexOf(p) === i);
  for (const part of parts) {
    const direct = phoneRule.safeParse(part);
    if (direct.success) return { phone: direct.data };
    const digits = part.replace(/\D/g, "");
    if (!part.startsWith("+") && !part.startsWith("0") && digits.length >= 11 && digits.length <= 15 && digits.length === part.replace(/[\s().-]/g, "").length) {
      const international = phoneRule.safeParse(`+${digits}`);
      if (international.success) return { phone: international.data, note: `Phone read as ${international.data}: check the country code` };
    }
  }
  return { problem: `Phone number ${quote(text)} is not valid. Use a 10-digit mobile number, or add the country code` };
}

const PASSPORT_YES = new Set(["yes", "y", "has passport", "have", "available", "yes available", "passport available", "ok"]);
const PASSPORT_NO = new Set(["no", "nil", "nill", "none", "no passport", "not available", "dont have", "don t have", "do not have", "not applied", "nothing"]);

/**
 * Passport No cell → normalised number (the form's rule: 6–12 letters and digits as printed), or a yes/no answer
 * ("Has passport", "Nil"). A number hidden in a downloaded list (XXXX1234) is left blank with a note.
 */
export function parsePassportCell(value: CellPlain): { number: string | null; hasPassport: boolean | null; problem?: string; note?: string } {
  const raw = typeof value === "number" ? (Number.isSafeInteger(value) && value > 0 ? String(value) : "") : oneLine(cellText(value));
  const key = wordKey(raw);
  if (!raw || /^-+$/.test(raw)) return { number: null, hasPassport: null };
  if (!/\d/.test(raw)) {
    if (PASSPORT_YES.has(key)) return { number: null, hasPassport: true };
    if (PASSPORT_NO.has(key)) return { number: null, hasPassport: false };
    if (BLANK_WORDS.has(key)) return { number: null, hasPassport: null };
    return { number: null, hasPassport: null, note: `Passport No ${quote(raw)} is not a number: left blank` };
  }
  if (/[*•]/.test(raw) || /^x{3,}/i.test(raw.replace(/\s/g, ""))) return { number: null, hasPassport: true, note: "Passport number is hidden in this file: left blank" };
  const checked = passportRule.safeParse(raw);
  if (!checked.success || !checked.data) return { number: null, hasPassport: null, problem: `Passport No ${quote(raw)} is not valid. Type it as printed: 6 to 12 letters and digits` };
  return { number: normaliseIdentityNumber(checked.data), hasPassport: true };
}

const EMAIL_NONE = new Set(["no mail", "no email", "no e mail", "not available", "nil", "nill", "none", "no", "na", "n a"]);

/** Email cell → lower-cased address through the form's rule; an invalid address is left blank with a note. */
export function parseEmailCell(value: CellPlain): { email: string | null; note?: string } {
  const text = oneLine(cellText(value)).replace(/^mailto:/i, "");
  if (!text || /^-+$/.test(text) || EMAIL_NONE.has(wordKey(text))) return { email: null };
  const checked = emailRule.safeParse(text);
  if (checked.success && checked.data) return { email: checked.data };
  return { email: null, note: `Email ${quote(text)} is not valid: left blank` };
}

const ZERO_YEARS = new Set(["nil", "nill", "no", "none", "fresher", "fresh", "zero", "nothing", "no experience"]);

/**
 * Years cell → whole years 0–60 ("5", 5, "5 yrs", "5+", "2.5" → 2, "6 months" → 0, "Fresher" / "Nil" → 0, "-" / "NA" →
 * blank). Anything else is left blank and reported (`ok: false`).
 */
export function parseYearsCell(value: CellPlain): { years: number | null; ok: boolean } {
  if (value === null) return { years: null, ok: true };
  let n: number;
  if (typeof value === "number") n = value;
  else {
    const text = oneLine(cellText(value)).toLowerCase();
    const key = wordKey(text);
    if (!key || key === "na" || key === "n a" || key === "not applicable") return { years: null, ok: true };
    if (ZERO_YEARS.has(key)) return { years: 0, ok: true };
    const m = /(\d+(?:\.\d+)?)/.exec(text);
    if (!m) return { years: null, ok: false };
    n = Number(m[1]);
    if (/\b(months?|mnths?|mths?)\b/.test(text) && !/\b(years?|yrs?)\b/.test(text)) n /= 12;
  }
  if (!Number.isFinite(n) || n < 0 || n > CV_MAX_EXPERIENCE_YEARS) return { years: null, ok: false };
  return { years: Math.floor(n), ok: true };
}

function clip(text: string, max: number): { text: string; clipped: boolean } {
  return text.length > max ? { text: `${text.slice(0, max - 1)}…`, clipped: true } : { text, clipped: false };
}

// ---------------------------------------------------------------------------
// Trades and countries
// ---------------------------------------------------------------------------

export type CvImportTrade = { id: string; name: string; slug: string };
export type CvImportCountry = { code: string; name: string };
export type CvImportLookups = {
  trades: readonly CvImportTrade[];
  countries: readonly CvImportCountry[];
  /** YYYY-MM-DD, for "passport has expired" notes. */
  today: string;
};

/**
 * Trade text → one of our trades: the name or slug ignoring case and punctuation; then a part of a combined name
 * ("Cook" → "Chef / cook", "Labourer" → "General helper / labourer") or the name without its brackets
 * ("Lineman" → "Lineman (transmission and distribution)"); then the same without a plural "s". Exact matches win.
 */
export function buildTradeMatcher(trades: readonly CvImportTrade[]): (typed: string) => CvImportTrade | null {
  const exact = new Map<string, CvImportTrade>();
  const loose = new Map<string, CvImportTrade>();
  for (const t of trades) {
    for (const key of [wordKey(t.name), wordKey(t.slug)]) if (key && !exact.has(key)) exact.set(key, t);
  }
  for (const t of trades) {
    const base = t.name.replace(/\([^)]*\)/g, " ");
    for (const key of [base, ...base.split("/")].map(wordKey)) if (key && !exact.has(key) && !loose.has(key)) loose.set(key, t);
  }
  const find = (key: string) => exact.get(key) ?? loose.get(key) ?? null;
  return (typed) => {
    const key = wordKey(typed);
    if (!key) return null;
    return find(key) ?? (key.endsWith("s") && key.length > 3 ? find(key.slice(0, -1)) : null);
  };
}

/** Common ways the office writes our main destinations (city or short name → ISO code). */
const COUNTRY_ALIASES: Record<string, string> = {
  uae: "AE", "u a e": "AE", emirates: "AE", dubai: "AE", "abu dhabi": "AE", sharjah: "AE", ajman: "AE", "ras al khaimah": "AE", fujairah: "AE",
  ksa: "SA", "k s a": "SA", saudi: "SA", riyadh: "SA", jeddah: "SA", dammam: "SA", jubail: "SA", khobar: "SA", "al khobar": "SA", yanbu: "SA",
  doha: "QA", muscat: "OM", "kuwait city": "KW", manama: "BH",
  uk: "GB", "u k": "GB", england: "GB", britain: "GB", "great britain": "GB",
  usa: "US", "u s a": "US", america: "US", "united states of america": "US",
};
/** "Any country" answers: stored as no preference, without a note. */
const ANY_COUNTRY = new Set(["any", "any country", "anywhere", "all", "all countries", "gulf", "gcc", "any gulf", "gulf countries", "middle east", "abroad", "overseas", "open", "no preference", "na", "n a", "nil", "none", "no"]);

/** Country text → active country ("any" = no preference). Matches the name, the 2-letter code or a common alias. */
export function buildCountryMatcher(countries: readonly CvImportCountry[]): (typed: string) => CvImportCountry | "any" | null {
  const byKey = new Map<string, CvImportCountry>();
  const byCode = new Map<string, CvImportCountry>();
  for (const c of countries) {
    byCode.set(c.code.toUpperCase(), c);
    byKey.set(wordKey(c.name), c);
  }
  return (typed) => {
    const key = wordKey(typed);
    if (!key || ANY_COUNTRY.has(key)) return "any";
    if (/^[a-z]{2}$/.test(key)) return byCode.get(key.toUpperCase()) ?? null;
    const alias = COUNTRY_ALIASES[key];
    return byKey.get(key) ?? (alias ? (byCode.get(alias) ?? null) : null);
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Everything needed to insert one cv_submissions row. */
export type CvImportCandidate = {
  name: string;
  phone: string;
  jobCategoryId: string | null;
  tradeLabel: string;
  tradeOther: string | null;
  /** Normalised (normaliseIdentityNumber), not yet encrypted. */
  passportNumber: string | null;
  hasPassport: boolean | null;
  passportExpiry: string | null;
  experienceAbroadYears: number | null;
  experienceIndiaYears: number | null;
  experienceYears: number | null;
  email: string | null;
  preferredCountryCode: string | null;
  staffRemarks: string | null;
  candidateNotes: string | null;
};

export type CvImportCheckedRow = {
  row: number;
  /** What the check screen shows (status and reasons are added by classifyCvImportRows). */
  view: Omit<CvImportRowView, "status" | "reasons">;
  problems: string[];
  /** Null when the row has problems. */
  candidate: CvImportCandidate | null;
};

const LETTER = new RegExp("\\p{L}", "u");

function checkRow(raw: CvImportRawRow, ctx: { matchTrade: ReturnType<typeof buildTradeMatcher>; matchCountry: ReturnType<typeof buildCountryMatcher>; today: string; date1904: boolean }): CvImportCheckedRow {
  const v = raw.values;
  const problems: string[] = [];
  const notes: string[] = [];

  const nameText = oneLine(cellText(v.name ?? null));
  let name: string | null = null;
  if (!nameText) problems.push("Name is missing");
  else if (!LETTER.test(nameText)) problems.push(`Name ${quote(nameText)} has no letters`);
  else {
    const checked = nameRule.safeParse(nameText);
    if (checked.success) name = checked.data;
    else problems.push("Name is too long (120 letters at most)");
  }

  const phone = parsePhoneCell(v.phone ?? null);
  if ("problem" in phone) problems.push(phone.problem);
  else if (phone.note) notes.push(phone.note);

  const tradeText = oneLine(cellText(v.trade ?? null));
  let trade: { jobCategoryId: string | null; label: string; typed: boolean } | null = null;
  if (!tradeText) problems.push("Trade is missing");
  else {
    const listed = ctx.matchTrade(tradeText);
    if (listed) trade = { jobCategoryId: listed.id, label: listed.name, typed: false };
    else if (!typedTradeRule.safeParse(tradeText).success) problems.push("Trade is too long (120 letters at most)");
    else {
      trade = { jobCategoryId: null, label: tradeText, typed: true };
      notes.push(`Trade ${quote(tradeText)} is not in our list: saved as typed`);
    }
  }

  const passport = parsePassportCell(v.passportNumber ?? null);
  if (passport.problem) problems.push(passport.problem);
  if (passport.note) notes.push(passport.note);

  const expiry = parseExpiryCell(v.passportExpiry ?? null, ctx.date1904);
  if (expiry.problem) problems.push(expiry.problem);
  else if (expiry.iso && expiry.iso < ctx.today) notes.push(`Passport expired on ${expiry.iso}`);

  const years = (field: "experienceAbroad" | "experienceIndia" | "experienceTotal", label: string): number | null => {
    const value = v[field] ?? null;
    const parsed = parseYearsCell(value);
    if (!parsed.ok) notes.push(`${label} ${quote(cellText(value))} is not a number of years: left blank`);
    return parsed.years;
  };
  const abroadRaw = years("experienceAbroad", "Exp Abroad");
  const indiaRaw = years("experienceIndia", "Exp India");
  const totalRaw = years("experienceTotal", "Experience");
  // The form's own year rules (whole years, 0–60) and its total for matching (abroad + India, else the single figure).
  const abroad = abroadRaw === null ? null : (experienceAbroadRule.safeParse(abroadRaw).data ?? null);
  const india = indiaRaw === null ? null : (experienceIndiaRule.safeParse(indiaRaw).data ?? null);

  const email = parseEmailCell(v.email ?? null);
  if (email.note) notes.push(email.note);

  let countryCode: string | null = null;
  const countryText = oneLine(cellText(v.country ?? null));
  if (countryText) {
    const match = ctx.matchCountry(countryText);
    if (match === null) notes.push(`Preferred country ${quote(countryText)} not found: left blank`);
    else if (match !== "any") countryCode = match.code;
  }

  const remarks = clip(multiLine(cellText(v.remarks ?? null)), CV_IMPORT_REMARKS_MAX);
  if (remarks.clipped) notes.push(`Remarks shortened to ${CV_IMPORT_REMARKS_MAX.toLocaleString("en-IN")} letters`);
  const candidateNotes = clip(multiLine(cellText(v.candidateNotes ?? null)), CV_IMPORT_NOTES_MAX);
  if (candidateNotes.clipped) notes.push(`Candidate notes shortened to ${CV_IMPORT_NOTES_MAX.toLocaleString("en-IN")} letters`);

  const view: CvImportCheckedRow["view"] = {
    row: raw.row,
    name: nameText.slice(0, 120),
    phone: "phone" in phone ? phone.phone : oneLine(cellText(v.phone ?? null)).slice(0, 40) || null,
    trade: trade?.label ?? tradeText.slice(0, 120),
    tradeListed: Boolean(trade && !trade.typed),
    passportLast4: passport.number ? last4(passport.number) : null,
    notes,
  };
  if (problems.length || !name || !trade || "problem" in phone) return { row: raw.row, view, problems, candidate: null };

  return {
    row: raw.row,
    view,
    problems,
    candidate: {
      name,
      phone: phone.phone,
      jobCategoryId: trade.jobCategoryId,
      tradeLabel: trade.label,
      tradeOther: trade.typed ? trade.label : null,
      passportNumber: passport.number,
      // A passport number or an expiry date means the person has a passport.
      hasPassport: passport.number || expiry.iso ? true : passport.hasPassport,
      passportExpiry: expiry.iso,
      experienceAbroadYears: abroad,
      experienceIndiaYears: india,
      experienceYears: totalExperienceYears(abroad, india, totalRaw),
      email: email.email,
      preferredCountryCode: countryCode,
      staffRemarks: remarks.text || null,
      candidateNotes: candidateNotes.text || null,
    },
  };
}

/** Check every row against the form's rules and our trades / countries (no database). */
export function checkCvImportRows(sheet: CvImportSheet, lookups: CvImportLookups): CvImportCheckedRow[] {
  const ctx = { matchTrade: buildTradeMatcher(lookups.trades), matchCountry: buildCountryMatcher(lookups.countries), today: lookups.today, date1904: sheet.date1904 };
  return sheet.rows.map((raw) => checkRow(raw, ctx));
}

/** People already in the CV list: E.164 phone → reference, normalised passport number → reference. */
export type CvImportExisting = { byPhone: ReadonlyMap<string, string>; byPassport: ReadonlyMap<string, string> };

export type CvImportClassifiedRow = CvImportCheckedRow & { status: CvImportRowStatus; reasons: string[] };

/**
 * Final status of each row, in file order: problems first; then already in the CV list (same phone, then same
 * passport number); then the same person higher up in the file. The first good row of a person is the one imported.
 */
export function classifyCvImportRows(rows: readonly CvImportCheckedRow[], existing: CvImportExisting): CvImportClassifiedRow[] {
  const seenPhone = new Map<string, number>();
  const seenPassport = new Map<string, number>();
  return rows.map((r): CvImportClassifiedRow => {
    const c = r.candidate;
    if (!c || r.problems.length) return { ...r, status: "problem", reasons: r.problems };
    const phoneRef = existing.byPhone.get(c.phone);
    if (phoneRef) return { ...r, status: "exists", reasons: [`Already in the CV list as ${phoneRef} (same phone)`] };
    const passportRef = c.passportNumber ? existing.byPassport.get(c.passportNumber) : undefined;
    if (passportRef) return { ...r, status: "exists", reasons: [`Already in the CV list as ${passportRef} (same passport number)`] };
    const phoneRow = seenPhone.get(c.phone);
    if (phoneRow) return { ...r, status: "duplicate", reasons: [`Same phone as row ${phoneRow} of this file`] };
    const passportRow = c.passportNumber ? seenPassport.get(c.passportNumber) : undefined;
    if (passportRow) return { ...r, status: "duplicate", reasons: [`Same passport number as row ${passportRow} of this file`] };
    seenPhone.set(c.phone, r.row);
    if (c.passportNumber) seenPassport.set(c.passportNumber, r.row);
    return { ...r, status: "ready", reasons: [] };
  });
}

export function countCvImportRows(rows: readonly CvImportClassifiedRow[]): Record<CvImportRowStatus, number> {
  const counts: Record<CvImportRowStatus, number> = { ready: 0, problem: 0, duplicate: 0, exists: 0 };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

export function toRowView(r: CvImportClassifiedRow): CvImportRowView {
  return { ...r.view, status: r.status, reasons: r.reasons };
}
