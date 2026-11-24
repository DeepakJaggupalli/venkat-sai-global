import "server-only";

import { PassThrough } from "node:stream";

import ExcelJS from "exceljs";

import { describeExport, EXPORT_COMPANY_NAME, EXPORT_TIME_ZONE, formatExportDateTime, neutraliseFormula, type XlsxCellValue, type XlsxColumn } from "@/lib/xlsx-export";

import { BACKUP_MAX_ROWS_PER_SHEET } from "./schemas";

/**
 * Multi-sheet Excel workbook for the full backup (no database access here; unit-tested in workbook.test.ts).
 *
 * Every sheet has the same layout as the single-list downloads (src/lib/xlsx-export.ts):
 *   row 1  company name (bold, merged across every column)
 *   row 2  sheet title · "All records" · generated date/time (Asia/Kolkata) · row count or the truncation note
 *   row 3  header row (S.No first, added automatically)
 *   row 4+ data
 * Text cells are neutralised against formula injection and stored as text. Each sheet holds at most
 * BACKUP_MAX_ROWS_PER_SHEET rows; row 2 says "Showing the first 20,000 of 23,456 rows" when it was cut short.
 *
 * Written with ExcelJS's streaming writer: rows are serialised as they are added and sheets can be produced one at a
 * time (SheetSource), so a large backup never holds every area's rows and every cell object in memory at once.
 */

export type BackupSheet<T> = {
  /** Tab name (cleaned and cut to Excel's 31 characters). */
  sheetName: string;
  /** Title in row 2, e.g. "CV submissions and applicants". */
  title: string;
  rows: readonly T[];
  columns: readonly XlsxColumn<T>[];
  /** Rows in the database (more than `rows` when the query stopped at the cap). */
  total: number;
};

/** A sheet with its cell values worked out, ready to write. */
export type PreparedSheet = {
  sheetName: string;
  title: string;
  /** "S.No" first. */
  headers: string[];
  wrap: boolean[];
  widths: number[];
  /** Data rows (S.No first), already capped. */
  data: (string | number)[][];
  shown: number;
  total: number;
  truncated: boolean;
};

/** Built when the workbook gets to it, so only one area's rows are in memory at a time. */
export type SheetSource = PreparedSheet | (() => Promise<PreparedSheet>);

export type SheetSummary = { sheetName: string; title: string; rows: number; total: number; truncated: boolean };

/** Excel's limit for one cell. */
const MAX_CELL_CHARS = 32_000;
const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };

/** Tab names: no \ / ? * [ ] :, at most 31 characters, never blank. */
export function cleanSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
}

/** Cell value as written: numbers stay numbers, dates become "08 Nov 2026, 11:00" (IST), text is neutralised. */
export function backupCellValue(value: XlsxCellValue, timeZone: string = EXPORT_TIME_ZONE): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : formatExportDateTime(value, timeZone);
  const text = value.replace(/\r\n?/g, "\n");
  return neutraliseFormula(text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS - 1)}…` : text);
}

/** Work out the cell values, widths and the cap of one sheet. */
export function prepareSheet<T>(sheet: BackupSheet<T>, opts: { maxRows?: number; timeZone?: string } = {}): PreparedSheet {
  const max = opts.maxRows ?? BACKUP_MAX_ROWS_PER_SHEET;
  const timeZone = opts.timeZone ?? EXPORT_TIME_ZONE;
  const rows = sheet.rows.slice(0, max);
  const total = Math.max(sheet.total, sheet.rows.length);
  const headers = ["S.No", ...sheet.columns.map((c) => c.header)];
  const data = rows.map((row, i) => [i + 1, ...sheet.columns.map((c) => backupCellValue(c.value(row), timeZone))]);
  const widths = headers.map((header, i) => {
    if (i === 0) return 6;
    const spec = sheet.columns[i - 1];
    if (spec?.width) return spec.width;
    const longest = data.reduce((m, r) => Math.max(m, String(r[i] ?? "").split("\n").reduce((a, l) => Math.max(a, l.length), 0)), header.length);
    return Math.min(spec?.wrap ? 50 : 60, Math.max(8, longest + 2));
  });
  return {
    sheetName: cleanSheetName(sheet.sheetName),
    title: sheet.title,
    headers,
    wrap: [false, ...sheet.columns.map((c) => Boolean(c.wrap))],
    widths,
    data,
    shown: rows.length,
    total,
    truncated: total > rows.length,
  };
}

/** Let the zip stream drain between batches of rows. */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

async function writeSheet(workbook: ExcelJS.Workbook, sheet: PreparedSheet, generatedAt: Date, timeZone: string): Promise<void> {
  const ws = workbook.addWorksheet(sheet.sheetName, {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  // Widths must be known before the first row is written.
  ws.columns = sheet.widths.map((width) => ({ width }));
  const columnCount = sheet.headers.length;

  const company = ws.addRow([EXPORT_COMPANY_NAME]);
  const description = ws.addRow([describeExport({ title: sheet.title, generatedAt, timeZone, shown: sheet.shown, total: sheet.total, truncated: sheet.truncated })]);
  if (columnCount > 1) {
    ws.mergeCells(1, 1, 1, columnCount);
    ws.mergeCells(2, 1, 2, columnCount);
  }
  company.height = 22;
  const companyCell = company.getCell(1);
  companyCell.font = { bold: true, size: 14 };
  companyCell.alignment = { horizontal: "center", vertical: "middle" };
  description.height = 32;
  const titleCell = description.getCell(1);
  titleCell.font = { bold: true, size: 11 };
  titleCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  const header = ws.addRow(sheet.headers);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  header.commit();

  for (let i = 0; i < sheet.data.length; i++) {
    const row = ws.addRow(sheet.data[i]!);
    for (let col = 1; col <= columnCount; col++) {
      const cell = row.getCell(col);
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      cell.alignment = { vertical: "top", wrapText: sheet.wrap[col - 1] ?? false };
      // Keep every text cell as text (no number/date guessing by the spreadsheet).
      if (typeof cell.value === "string") cell.numFmt = "@";
    }
    row.commit();
    if (i % 500 === 499) await breathe();
  }
  if (sheet.data.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columnCount } };
  ws.commit();
}

/** Build the workbook, one sheet after another, in the order given. Returns the .xlsx bytes and what each sheet holds. */
export async function writeBackupWorkbook(input: { sheets: readonly SheetSource[]; generatedAt?: Date; timeZone?: string }): Promise<{ bytes: Uint8Array; sheets: SheetSummary[] }> {
  const generatedAt = input.generatedAt ?? new Date();
  const timeZone = input.timeZone ?? EXPORT_TIME_ZONE;
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    output.on("end", resolve);
    output.on("error", reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: true });
  workbook.creator = EXPORT_COMPANY_NAME;
  workbook.created = generatedAt;

  const summaries: SheetSummary[] = [];
  const names = new Set<string>();
  for (const source of input.sheets) {
    const sheet = typeof source === "function" ? await source() : source;
    // Tab names must be unique (Excel compares them without case).
    let name = sheet.sheetName;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = cleanSheetName(`${sheet.sheetName.slice(0, 27)} (${n})`);
    names.add(name.toLowerCase());
    await writeSheet(workbook, { ...sheet, sheetName: name }, generatedAt, timeZone);
    summaries.push({ sheetName: name, title: sheet.title, rows: sheet.shown, total: sheet.total, truncated: sheet.truncated });
  }
  await workbook.commit();
  await ended;
  const buffer = Buffer.concat(chunks);
  return { bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), sheets: summaries };
}
