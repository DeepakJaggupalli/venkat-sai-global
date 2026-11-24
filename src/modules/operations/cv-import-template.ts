import "server-only";

import ExcelJS from "exceljs";

import { EXPORT_COMPANY_NAME, neutraliseFormula } from "@/lib/xlsx-export";

import { CV_IMPORT_MAX_ROWS, CV_IMPORT_TEMPLATE_HEADERS } from "./cv-import-schemas";

/**
 * The blank "Import CVs" workbook staff download (step 1). Sheet 1 "CVs": the header row only (no example people).
 * Sheet 2 "How to fill": short instructions. Sheet 3 "Lists": our trades and destination countries, used by the
 * dropdowns on the Trade and Preferred Country columns (typing any other value is still allowed). Phone, passport
 * and expiry columns are text, so Excel does not turn numbers into 9.88E+09 or read 03-04-2027 the American way.
 */

const WIDTHS = [7, 28, 18, 26, 16, 18, 12, 12, 28, 22, 40];
/** Columns kept as text (1-based): Phone, Passport No, Passport Expiry. */
const TEXT_COLUMNS = [3, 5, 6];
const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };

export const CV_IMPORT_INSTRUCTIONS: readonly string[] = [
  "How to fill the CVs sheet",
  "",
  "1. One person per row, starting from row 2. Do not change the column names in row 1.",
  "2. Name, Phone and Trade are needed. Everything else is optional: leave it blank if you do not know it.",
  "3. Phone: a 10-digit Indian mobile number (for example 9876543210), or the number with its country code for other countries (for example +971 50 123 4567).",
  "4. Trade: pick one from the list (the arrow in the cell) so CV matching works. Any other trade is kept exactly as you type it.",
  "5. Passport No: as printed in the passport, for example K1234567.",
  "6. Passport Expiry: day-month-year, for example 15-03-2027. We remind you before passports run out.",
  "7. Exp Abroad and Exp India: years of work, numbers only (for example 3). Write 0 for none.",
  "8. Preferred Country: pick one from the list, or leave it blank for any country.",
  "9. Remarks: anything the office should know. Only staff see it; the worker never does.",
  `10. Up to ${CV_IMPORT_MAX_ROWS.toLocaleString("en-IN")} people per file. Save the file as an Excel Workbook (.xlsx).`,
  "11. Only add people who gave us their CV and agreed that we contact them about jobs.",
  "12. People already in our CV list (same phone or passport number) are skipped, so uploading the same file again is safe.",
  "",
  "You can also upload a CV list downloaded from this site (Download Excel on the CV submissions page).",
  "Nobody gets a message when you import: call or WhatsApp them from the CV list.",
];

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 32;
}

/** Excel range of one column on the Lists sheet ("'Lists'!$A$2:$A$95"); null when the list is empty. */
function listRange(column: "A" | "B", count: number): string | null {
  return count ? `'Lists'!$${column}$2:$${column}$${count + 1}` : null;
}

/** Build the template. `trades` / `countries` are the live names (active trades, destination countries). */
export async function buildCvImportTemplate(lists: { trades: readonly string[]; countries: readonly string[] }): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = EXPORT_COMPANY_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("CVs", { views: [{ state: "frozen", ySplit: 1 }] });
  styleHeader(sheet.addRow([...CV_IMPORT_TEMPLATE_HEADERS]));
  WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  for (const col of TEXT_COLUMNS) sheet.getColumn(col).numFmt = "@";
  sheet.getColumn(11).alignment = { wrapText: true, vertical: "top" };

  const lastRow = CV_IMPORT_MAX_ROWS + 1;
  // exceljs supports range validations but does not declare `dataValidations` on Worksheet.
  const validations = (sheet as unknown as { dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void } }).dataValidations;
  const tradeRange = listRange("A", lists.trades.length);
  const countryRange = listRange("B", lists.countries.length);
  if (tradeRange) validations.add(`D2:D${lastRow}`, { type: "list", allowBlank: true, formulae: [tradeRange], showErrorMessage: false });
  if (countryRange) validations.add(`J2:J${lastRow}`, { type: "list", allowBlank: true, formulae: [countryRange], showErrorMessage: false });

  const help = workbook.addWorksheet("How to fill");
  help.getColumn(1).width = 110;
  CV_IMPORT_INSTRUCTIONS.forEach((line, i) => {
    const row = help.addRow([line]);
    row.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  const listSheet = workbook.addWorksheet("Lists");
  styleHeader(listSheet.addRow(["Trades", "Countries"]));
  listSheet.getColumn(1).width = 44;
  listSheet.getColumn(2).width = 28;
  const longest = Math.max(lists.trades.length, lists.countries.length);
  // Names typed by staff in Settings: neutralised like every other text we write to a workbook (the import strips the
  // leading apostrophe again, so a picked name still matches).
  const cell = (value: string | undefined) => (value === undefined ? null : neutraliseFormula(value));
  for (let i = 0; i < longest; i++) listSheet.addRow([cell(lists.trades[i]), cell(lists.countries[i])]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
