import "server-only";

import ExcelJS from "exceljs";

import { CONTACT } from "@/config/contact";

/**
 * Excel (.xlsx) downloads of staff lists of people (and employer reports). One layout everywhere:
 *   row 1  company name (bold, merged across every column)
 *   row 2  list title · filters applied · generated date/time (Asia/Kolkata) · truncation note
 *   row 3  header row (S.No first, added automatically)
 *   row 4+ data
 *
 * Callers authorise, decide what each viewer may see (masking) and write the data-access log; this helper only
 * formats. Text cells are neutralised against formula injection so a re-saved CSV can never run a formula.
 */

export const EXPORT_COMPANY_NAME = CONTACT.businessName;
/** Largest export; the title row says when a list was cut short. */
export const EXPORT_MAX_ROWS = 5000;
export const EXPORT_TIME_ZONE = "Asia/Kolkata";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type XlsxCellValue = string | number | Date | null | undefined;

export type XlsxColumn<T> = {
  header: string;
  value: (row: T) => XlsxCellValue;
  /** Character width (default: fitted to the content, 8–60). */
  width?: number;
  /** Long text (notes, remarks): wrap inside the cell. */
  wrap?: boolean;
};

export type XlsxExportInput<T> = {
  /** e.g. "CV submissions". */
  title: string;
  /** Human-readable filters ("Status: New"). Empty = "All records". */
  filters?: readonly string[];
  rows: readonly T[];
  columns: readonly XlsxColumn<T>[];
  /** Total matching rows when known (to say "first 5,000 of 6,234"). */
  totalRows?: number | null;
  generatedAt?: Date;
  timeZone?: string;
  sheetName?: string;
  maxRows?: number;
};

const PLAIN_NUMBER = /^[+-]?[\d\s().,/-]+$/;

/**
 * Text that a spreadsheet could read as a formula (starts with = + - @, tab or CR) gets a leading apostrophe.
 * Plain numbers and phone numbers ("+91 94942 63388", "-5") are left alone: they cannot call functions.
 */
export function neutraliseFormula(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value;
  if (/^[+-]/.test(value) && PLAIN_NUMBER.test(value)) return value;
  return `'${value}`;
}

/** Passport number for viewers without the full-reveal permission: "XXXX1234" (blank when unknown). */
export function maskPassportNumber(last4: string | null | undefined): string {
  const tail = (last4 ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-4);
  return tail ? `XXXX${tail.toUpperCase()}` : "";
}

export function formatExportDateTime(value: Date, timeZone = EXPORT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

export function formatExportDate(value: Date | string, timeZone = EXPORT_TIME_ZONE): string {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: typeof value === "string" && value.length === 10 ? "UTC" : timeZone, day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function isoDateIn(value: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

/** venkat-sai-<slug>-YYYY-MM-DD.xlsx (date in Asia/Kolkata). */
export function exportFilename(slug: string, generatedAt: Date = new Date(), timeZone = EXPORT_TIME_ZONE): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `venkat-sai-${safe || "export"}-${isoDateIn(generatedAt, timeZone)}.xlsx`;
}

/** Text of the second row: title, filters, generated time, truncation. */
export function describeExport(input: { title: string; filters?: readonly string[]; generatedAt: Date; timeZone?: string; shown: number; total: number | null; truncated: boolean }): string {
  const parts = [input.title, input.filters?.length ? `Filters: ${input.filters.join("; ")}` : "All records", `Generated ${formatExportDateTime(input.generatedAt, input.timeZone)} IST`];
  if (input.truncated) parts.push(input.total !== null ? `Showing the first ${input.shown.toLocaleString("en-IN")} of ${input.total.toLocaleString("en-IN")} rows (export limit)` : `Showing the first ${input.shown.toLocaleString("en-IN")} rows (export limit)`);
  else parts.push(`${input.shown.toLocaleString("en-IN")} ${input.shown === 1 ? "row" : "rows"}`);
  return parts.join("  |  ");
}

function cellText(value: XlsxCellValue, timeZone: string): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : formatExportDateTime(value, timeZone);
  return neutraliseFormula(value.replace(/\r\n?/g, "\n"));
}

const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };

/** Build the workbook. Returns the .xlsx bytes. */
export async function buildXlsx<T>(input: XlsxExportInput<T>): Promise<Uint8Array> {
  const timeZone = input.timeZone ?? EXPORT_TIME_ZONE;
  const generatedAt = input.generatedAt ?? new Date();
  const max = input.maxRows ?? EXPORT_MAX_ROWS;
  const total = input.totalRows ?? null;
  const truncated = input.rows.length > max || (total !== null && total > Math.min(input.rows.length, max));
  const rows = input.rows.slice(0, max);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = EXPORT_COMPANY_NAME;
  workbook.created = generatedAt;
  const sheet = workbook.addWorksheet((input.sheetName ?? input.title).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Export", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  const headers = ["S.No", ...input.columns.map((c) => c.header)];
  const data = rows.map((row, i) => [i + 1, ...input.columns.map((c) => cellText(c.value(row), timeZone))]);
  const columnCount = headers.length;

  // Row 1: company name. Row 2: description.
  sheet.addRow([EXPORT_COMPANY_NAME]);
  sheet.addRow([describeExport({ title: input.title, filters: input.filters, generatedAt, timeZone, shown: rows.length, total, truncated })]);
  if (columnCount > 1) {
    sheet.mergeCells(1, 1, 1, columnCount);
    sheet.mergeCells(2, 1, 2, columnCount);
  }
  const companyCell = sheet.getCell(1, 1);
  companyCell.font = { bold: true, size: 14 };
  companyCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 22;
  const titleCell = sheet.getCell(2, 1);
  titleCell.font = { bold: true, size: 11 };
  titleCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 32;

  // Row 3: headers.
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  for (const values of data) {
    const row = sheet.addRow(values);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      const column = input.columns[col - 2];
      cell.alignment = { vertical: "top", wrapText: Boolean(column?.wrap) };
      // Keep every text cell as text (no number/date guessing by the spreadsheet).
      if (typeof cell.value === "string") cell.numFmt = "@";
    });
  }

  headers.forEach((header, i) => {
    const column = sheet.getColumn(i + 1);
    const spec = i === 0 ? undefined : input.columns[i - 1];
    if (spec?.width) {
      column.width = spec.width;
      return;
    }
    const longest = data.reduce((m, r) => Math.max(m, String(r[i] ?? "").split("\n").reduce((a, l) => Math.max(a, l.length), 0)), header.length);
    column.width = i === 0 ? 6 : Math.min(spec?.wrap ? 50 : 60, Math.max(8, longest + 2));
  });
  if (data.length) sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columnCount } };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/** The download response (private, never cached). */
export function xlsxResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
