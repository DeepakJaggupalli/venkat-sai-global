import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { ActionError } from "@/lib/actions";
import { maskEmail, maskPhone } from "@/lib/format";
import { buildXlsx, maskPassportNumber } from "@/lib/xlsx-export";

import {
  buildCountryMatcher,
  buildTradeMatcher,
  cellText,
  checkCvImportRows,
  classifyCvImportRows,
  countCvImportRows,
  excelSerialToIso,
  headerField,
  inspectZip,
  parseDateText,
  parseEmailCell,
  parseExpiryCell,
  parsePassportCell,
  parsePhoneCell,
  parseYearsCell,
  plainCellValue,
  readCvImportWorkbook,
  type CvImportLookups,
} from "./cv-import-parse";
import { CV_IMPORT_TEMPLATE_HEADERS } from "./cv-import-schemas";
import { buildCvImportTemplate } from "./cv-import-template";

const lookups: CvImportLookups = {
  trades: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Welder", slug: "welder" },
    { id: "00000000-0000-4000-8000-000000000002", name: "Pipe fitter", slug: "pipe-fitter" },
    { id: "00000000-0000-4000-8000-000000000003", name: "General helper / labourer", slug: "general-helper" },
    { id: "00000000-0000-4000-8000-000000000004", name: "Lineman (transmission and distribution)", slug: "lineman" },
    { id: "00000000-0000-4000-8000-000000000005", name: "Welder (TIG / GTAW)", slug: "welder-tig-gtaw" },
  ],
  countries: [
    { code: "AE", name: "United Arab Emirates" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "IN", name: "India" },
  ],
  today: "2026-11-23",
};

async function workbook(rows: unknown[][], opts: { sheetName?: string; extraFirstSheet?: boolean } = {}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  if (opts.extraFirstSheet) wb.addWorksheet("Notes").addRow(["Read me first"]);
  const sheet = wb.addWorksheet(opts.sheetName ?? "CVs");
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function expectFileError(bytes: Uint8Array, pattern: RegExp) {
  const error = await readCvImportWorkbook(bytes).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ActionError);
  expect((error as ActionError).message).toMatch(pattern);
}

describe("headerField", () => {
  it("reads the template headers", () => {
    expect(CV_IMPORT_TEMPLATE_HEADERS.map(headerField)).toEqual(["sno", "name", "phone", "trade", "passportNumber", "passportExpiry", "experienceAbroad", "experienceIndia", "email", "country", "remarks"]);
  });

  it("reads the site's own CV download headers", () => {
    const headers = ["S.No", "Name", "Trade", "Passport No", "Passport expiry", "Phone number(s)", "Candidate notes", "Staff remarks", "Experience (years)", "Preferred country", "Requirement", "Status", "Reference", "Received"];
    expect(headers.map(headerField)).toEqual(["sno", "name", "trade", "passportNumber", "passportExpiry", "phone", "candidateNotes", "remarks", "experienceTotal", "country", null, null, null, null]);
    // The current download (CV_SUBMISSION_EXPORT_HEADERS, after the S.No column).
    const current = ["S.No", "Name", "Trade", "Passport No", "Exp Abroad (yrs)", "Exp India (yrs)", "Email", "Phone", "Applied for", "Applied on", "Status", "Preferred country", "Passport expiry", "Candidate notes", "Staff remarks"];
    expect(current.map(headerField)).toEqual(["sno", "name", "trade", "passportNumber", "experienceAbroad", "experienceIndia", "email", "phone", null, null, null, "country", "passportExpiry", "candidateNotes", "remarks"]);
  });

  it("tolerates small variations and refuses look-alikes", () => {
    expect(headerField("PASSPORT NUMBER")).toBe("passportNumber");
    expect(headerField("PassportNo")).toBe("passportNumber");
    expect(headerField("PPT Exp")).toBe("passportExpiry");
    expect(headerField("Mobile No.")).toBe("phone");
    expect(headerField("WhatsApp Number")).toBe("phone");
    expect(headerField("E-mail ID")).toBe("email");
    expect(headerField("Mail id")).toBe("email");
    expect(headerField("Gulf Experience")).toBe("experienceAbroad");
    expect(headerField("Indian Exp")).toBe("experienceIndia");
    expect(headerField("Candidate Name")).toBe("name");
    expect(headerField("Name as per passport")).toBe("name");
    expect(headerField("Position applied")).toBe("trade");
    expect(headerField("Sl. No.")).toBe("sno");
    expect(headerField("Father Name")).toBeNull();
    expect(headerField("Alternate mobile")).toBeNull();
    expect(headerField("Passport issue date")).toBeNull();
    expect(headerField("Visa expiry")).toBeNull();
    expect(headerField("Trade test result")).toBeNull();
    expect(headerField("Address")).toBeNull();
  });
});

describe("cell values", () => {
  it("flattens exceljs values", () => {
    expect(plainCellValue({ richText: [{ text: "Ravi " }, { text: "Kumar" }] })).toBe("Ravi Kumar");
    expect(plainCellValue({ formula: "A1", result: 42 })).toBe(42);
    expect(plainCellValue({ formula: "A1" })).toBeNull();
    expect(plainCellValue({ text: "ravi@gmail.com", hyperlink: "mailto:ravi@gmail.com" })).toBe("ravi@gmail.com");
    expect(plainCellValue({ error: "#N/A" })).toBeNull();
  });

  it("removes the formula-protection apostrophe of our own download, and only that", () => {
    expect(cellText("'-- call after 5 pm")).toBe("-- call after 5 pm");
    expect(cellText("'=SUM(A1)")).toBe("=SUM(A1)");
    expect(cellText("'+91 ******3210")).toBe("+91 ******3210");
    expect(cellText("'@ravi")).toBe("@ravi");
    expect(cellText("'Ravi")).toBe("'Ravi");
    expect(cellText("'9876543210")).toBe("'9876543210");
    expect(cellText("Ravi Kumar​")).toBe("Ravi Kumar");
  });

  it("normalises phone numbers the way the form does", () => {
    for (const value of [9876543210, "9876543210", "+91 98765 43210", "0091 98765 43210", "09876543210", "919876543210", "98765-43210"]) {
      expect(parsePhoneCell(value)).toEqual({ phone: "+919876543210" });
    }
    expect(parsePhoneCell("98765 43210 / 91234 56789")).toEqual({ phone: "+919876543210" });
    expect(parsePhoneCell("+971 50 123 4567")).toEqual({ phone: "+971501234567" });
    const lostPlus = parsePhoneCell(971501234567);
    expect(lostPlus).toMatchObject({ phone: "+971501234567" });
    expect("note" in lostPlus && lostPlus.note).toMatch(/check the country code/);
    expect(parsePhoneCell(null)).toEqual({ problem: "Phone number is missing" });
    expect(parsePhoneCell("+91 ******3210")).toMatchObject({ problem: expect.stringMatching(/hidden/) });
    expect(parsePhoneCell("12345")).toMatchObject({ problem: expect.stringMatching(/not valid/) });
    expect(parsePhoneCell("0501234567")).toMatchObject({ problem: expect.stringMatching(/country code/) });
  });

  it("reads dates as Excel serials, Date cells and day-first text", () => {
    expect(excelSerialToIso(46461)).toBe("2027-03-15");
    expect(excelSerialToIso(44999, true)).toBe("2027-03-15");
    for (const text of ["15-03-2027", "15/03/2027", "15.3.2027", "15-03-27", "15 Mar 2027", "15-March-2027", "15th March 2027", "2027-03-15", "Mar 15, 2027", "03/15/2027", "15/03/2027 00:00:00"]) {
      expect(parseDateText(text), text).toBe("2027-03-15");
    }
    expect(parseDateText("03-04-2027")).toBe("2027-04-03");
    expect(parseDateText("31-02-2027")).toBeNull();
    expect(parseExpiryCell(new Date(Date.UTC(2027, 2, 15)))).toEqual({ iso: "2027-03-15" });
    expect(parseExpiryCell(46461)).toEqual({ iso: "2027-03-15" });
    expect(parseExpiryCell("-")).toEqual({ iso: null });
    expect(parseExpiryCell("soon").problem).toMatch(/not a valid date/);
    expect(parseExpiryCell("15-03-1990").problem).toMatch(/not a valid date/);
  });

  it("reads passport cells: numbers, yes/no words and masked values", () => {
    expect(parsePassportCell("k 123-4567")).toEqual({ number: "K1234567", hasPassport: true });
    expect(parsePassportCell(12345678)).toEqual({ number: "12345678", hasPassport: true });
    expect(parsePassportCell("Has passport")).toEqual({ number: null, hasPassport: true });
    expect(parsePassportCell("No passport")).toEqual({ number: null, hasPassport: false });
    expect(parsePassportCell("Nil")).toEqual({ number: null, hasPassport: false });
    expect(parsePassportCell("N/A")).toEqual({ number: null, hasPassport: null });
    expect(parsePassportCell("XXXX1234")).toMatchObject({ number: null, hasPassport: true, note: expect.stringMatching(/hidden/) });
    expect(parsePassportCell("Applied")).toMatchObject({ number: null, note: expect.stringMatching(/not a number/) });
    expect(parsePassportCell("K1/234567").problem).toMatch(/not valid/);
  });

  it("reads email and years leniently", () => {
    expect(parseEmailCell("Ravi.Kumar@Gmail.com ")).toEqual({ email: "ravi.kumar@gmail.com" });
    expect(parseEmailCell("nil")).toEqual({ email: null });
    expect(parseEmailCell("ravi@gmail").note).toMatch(/not valid/);
    expect(parseYearsCell(5)).toEqual({ years: 5, ok: true });
    expect(parseYearsCell("5 yrs")).toEqual({ years: 5, ok: true });
    expect(parseYearsCell("2.5")).toEqual({ years: 2, ok: true });
    expect(parseYearsCell("6 months")).toEqual({ years: 0, ok: true });
    expect(parseYearsCell("Fresher")).toEqual({ years: 0, ok: true });
    expect(parseYearsCell("-")).toEqual({ years: null, ok: true });
    expect(parseYearsCell("2010")).toEqual({ years: null, ok: false });
    expect(parseYearsCell("many")).toEqual({ years: null, ok: false });
  });

  it("matches trades and countries", () => {
    const trade = buildTradeMatcher(lookups.trades);
    expect(trade("WELDER")?.slug).toBe("welder");
    expect(trade("Pipe Fitters")?.slug).toBe("pipe-fitter");
    expect(trade("pipe-fitter")?.slug).toBe("pipe-fitter");
    expect(trade("Labourer")?.slug).toBe("general-helper");
    expect(trade("Lineman")?.slug).toBe("lineman");
    expect(trade("Welder (TIG / GTAW)")?.slug).toBe("welder-tig-gtaw");
    expect(trade("TIG welder 6G")).toBeNull();
    const country = buildCountryMatcher(lookups.countries);
    expect(country("Dubai")).toMatchObject({ code: "AE" });
    expect(country("saudi arabia")).toMatchObject({ code: "SA" });
    expect(country("KSA")).toMatchObject({ code: "SA" });
    expect(country("ae")).toMatchObject({ code: "AE" });
    expect(country("Any")).toBe("any");
    expect(country("Gulf")).toBe("any");
    expect(country("Atlantis")).toBeNull();
  });
});

describe("readCvImportWorkbook", () => {
  it("reads our template (header on row 1) with no people as an error, and finds the instructions are not data", async () => {
    const template = await buildCvImportTemplate({ trades: ["Welder", "Pipe fitter"], countries: ["United Arab Emirates"] });
    await expectFileError(template, /no people/);
  });

  it("neutralises formula-like names on the template's Lists sheet", async () => {
    const template = await buildCvImportTemplate({ trades: ["Welder", "=HYPERLINK(\"http://x.invalid\",\"Click\")"], countries: ["@SUM(1)"] });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(template) as unknown as ArrayBuffer);
    const lists = book.getWorksheet("Lists")!;
    expect(lists.getCell(2, 1).value).toBe("Welder");
    expect(lists.getCell(3, 1).value).toBe("'=HYPERLINK(\"http://x.invalid\",\"Click\")");
    expect(lists.getCell(2, 2).value).toBe("'@SUM(1)");
    // The import strips the apostrophe again, so a picked name still matches the trade.
    expect(cellText("'=HYPERLINK(\"http://x.invalid\",\"Click\")")).toBe("=HYPERLINK(\"http://x.invalid\",\"Click\")");
  });

  it("reads a filled template, skipping blank rows and S.No-only rows", async () => {
    const bytes = await workbook([[...CV_IMPORT_TEMPLATE_HEADERS], [1, "Ravi Kumar", 9876543210, "Welder"], [], [3], [4, "Suresh", "+91 91234 56789", "Pipe fitter"]]);
    const sheet = await readCvImportWorkbook(bytes);
    expect(sheet.headerRow).toBe(1);
    expect(sheet.rows.map((r) => r.row)).toEqual([2, 5]);
    expect(sheet.columns.map((c) => c.field)).toContain("passportExpiry");
  });

  it("finds a header row below title rows, on a later sheet, and reports unused columns", async () => {
    const bytes = await workbook(
      [["Venkat Sai Welding Works and Testing Center"], ["CV submissions  |  All records  |  Generated 23 Nov 2026"], ["S.No", "Name", "Father Name", "Phone number(s)", "Trade", "Mobile"], [1, "Ravi", "Rao", "9876543210", "Welder", "9123456789"]],
      { extraFirstSheet: true },
    );
    const sheet = await readCvImportWorkbook(bytes);
    expect(sheet.sheetName).toBe("CVs");
    expect(sheet.headerRow).toBe(3);
    expect(sheet.columnsNotUsed).toEqual(["Father Name", "Mobile (second Phone column)"]);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.otherSheets).toEqual([]);
  });

  it("reads one sheet and names the other sheets that also list people", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Welders").addRows([
      ["Name", "Phone", "Trade"],
      ["Ravi", "9876543210", "Welder"],
    ]);
    wb.addWorksheet("Fitters").addRows([
      ["Name", "Mobile", "Trade"],
      ["Suresh", "9123456789", "Pipe fitter"],
    ]);
    wb.addWorksheet("Empty list").addRow(["Name", "Phone", "Trade"]);
    wb.addWorksheet("Notes").addRow(["Call after 5 pm"]);
    const hidden = wb.addWorksheet("Old", { state: "hidden" });
    hidden.addRows([
      ["Name", "Phone", "Trade"],
      ["Old", "9000000001", "Welder"],
    ]);
    const sheet = await readCvImportWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(sheet.sheetName).toBe("Welders");
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.otherSheets).toEqual(["Fitters"]);
  });

  it("imports the site's own Excel download (title rows, masked values, formula protection)", async () => {
    type Exported = { name: string; trade: string; passport: string; abroad: number | null; india: number | null; email: string; phone: string; country: string; expiry: string; notes: string; remarks: string };
    const columns = [
      { header: "Name", value: (r: Exported) => r.name },
      { header: "Trade", value: (r: Exported) => r.trade },
      { header: "Passport No", value: (r: Exported) => r.passport },
      { header: "Exp Abroad (yrs)", value: (r: Exported) => r.abroad },
      { header: "Exp India (yrs)", value: (r: Exported) => r.india },
      { header: "Email", value: (r: Exported) => r.email },
      { header: "Phone", value: (r: Exported) => r.phone },
      { header: "Applied for", value: () => "General (no requirement)" },
      { header: "Applied on", value: () => new Date(Date.UTC(2026, 10, 20, 6, 30)) },
      { header: "Status", value: () => "CV received" },
      { header: "Preferred country", value: (r: Exported) => r.country },
      { header: "Passport expiry", value: (r: Exported) => r.expiry },
      { header: "Candidate notes", value: (r: Exported) => r.notes, wrap: true },
      { header: "Staff remarks", value: (r: Exported) => r.remarks, wrap: true },
    ];
    const full: Exported = { name: "Ravi Kumar", trade: "Welder", passport: "K1234567", abroad: 3, india: 2, email: "ravi@gmail.com", phone: "+919876543210", country: "United Arab Emirates", expiry: "2027-03-15", notes: "=ready to travel", remarks: "-- call after 5 pm" };
    const masked: Exported = { ...full, name: "Suresh", passport: maskPassportNumber("4567"), email: maskEmail("suresh@gmail.com"), phone: maskPhone("+919123456789"), country: "Any" };
    const bytes = await buildXlsx({ title: "CV submissions", rows: [full, masked], columns });

    const sheet = await readCvImportWorkbook(bytes);
    expect(sheet.headerRow).toBe(3);
    expect(sheet.columnsNotUsed).toEqual(["Applied for", "Applied on", "Status"]);
    const rows = classifyCvImportRows(checkCvImportRows(sheet, lookups), { byPhone: new Map(), byPassport: new Map() });
    expect(rows.map((r) => r.status)).toEqual(["ready", "problem"]);
    expect(rows[0]!.candidate).toMatchObject({
      name: "Ravi Kumar",
      phone: "+919876543210",
      jobCategoryId: lookups.trades[0]!.id,
      passportNumber: "K1234567",
      passportExpiry: "2027-03-15",
      experienceYears: 5,
      email: "ravi@gmail.com",
      preferredCountryCode: "AE",
      candidateNotes: "=ready to travel",
      staffRemarks: "-- call after 5 pm",
    });
    // A list downloaded without the reveal permissions: the phone must be typed in full.
    expect(rows[1]!.reasons).toEqual(["Phone number is hidden in this file. Type the full number"]);
    expect(rows[1]!.view.phone).toBe("+91 ******6789");
    expect(rows[1]!.view.notes.join(" | ")).toMatch(/Passport number is hidden/);
  });

  it("explains files it cannot use", async () => {
    await expectFileError(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]), /old Excel file \(\.xls\) or a file locked with a password/);
    await expectFileError(new TextEncoder().encode("name,phone\nRavi,9876543210"), /not an Excel file/);
    await expectFileError(await workbook([["Name", "Trade"], ["Ravi", "Welder"]]), /not Phone/);
    await expectFileError(await workbook([["Worker list"], ["Ravi", "9876543210"]]), /could not find the column names/);
    const many = [["Name", "Phone", "Trade"], ...Array.from({ length: 2001 }, (_, i) => [`P ${i}`, `98765${String(i).padStart(5, "0")}`, "Welder"])];
    await expectFileError(await workbook(many), /limit is 2,000/);
  });

  it("measures the zip without unpacking it", async () => {
    const info = inspectZip(await workbook([["Name", "Phone", "Trade"]]));
    expect(info?.entries).toBeGreaterThan(3);
    expect(info?.uncompressedBytes).toBeGreaterThan(0);
    expect(inspectZip(new Uint8Array(30))).toBeNull();
  });
});

describe("checking and classifying rows", () => {
  it("flags problems, repeats and people already in the list", async () => {
    const bytes = await workbook([
      ["Name", "Phone", "Trade", "Passport No", "Passport Expiry", "Exp Abroad", "Exp India", "Email", "Preferred Country", "Remarks"],
      ["Ravi Kumar", 9876543210, "welder", "K1234567", "15-03-2027", 3, "2 yrs", "Ravi@Gmail.com", "Dubai", "Good TIG welder"],
      ["", "9123456789", "Welder"],
      ["Suresh", "", ""],
      ["Ravi again", "+91 98765 43210", "Welder"],
      ["Same passport", "9000000001", "Welder", "k1234567"],
      ["Known person", "9000000002", "Pipe fitter"],
      ["New trade", "9000000003", "Crane rigger 6G", "", "1-1-2020", "", "", "bad@", "Atlantis"],
      ["Bad date", "9000000004", "Welder", "", "31-02-2027"],
    ]);
    const sheet = await readCvImportWorkbook(bytes);
    const checked = checkCvImportRows(sheet, lookups);
    const rows = classifyCvImportRows(checked, { byPhone: new Map([["+919000000002", "VSG-CV-000007"]]), byPassport: new Map() });
    expect(rows.map((r) => r.status)).toEqual(["ready", "problem", "problem", "duplicate", "duplicate", "exists", "ready", "problem"]);
    expect(countCvImportRows(rows)).toEqual({ ready: 2, problem: 3, duplicate: 2, exists: 1 });

    const ravi = rows[0]!.candidate!;
    expect(ravi).toMatchObject({
      name: "Ravi Kumar",
      phone: "+919876543210",
      jobCategoryId: lookups.trades[0]!.id,
      tradeLabel: "Welder",
      tradeOther: null,
      passportNumber: "K1234567",
      hasPassport: true,
      passportExpiry: "2027-03-15",
      experienceAbroadYears: 3,
      experienceIndiaYears: 2,
      experienceYears: 5,
      email: "ravi@gmail.com",
      preferredCountryCode: "AE",
      staffRemarks: "Good TIG welder",
    });
    expect(rows[1]!.reasons).toEqual(["Name is missing"]);
    expect(rows[2]!.reasons).toEqual(["Phone number is missing", "Trade is missing"]);
    expect(rows[3]!.reasons).toEqual(["Same phone as row 2 of this file"]);
    expect(rows[4]!.reasons).toEqual(["Same passport number as row 2 of this file"]);
    expect(rows[5]!.reasons[0]).toMatch(/VSG-CV-000007/);
    const typed = rows[6]!;
    expect(typed.candidate).toMatchObject({ jobCategoryId: null, tradeLabel: "Crane rigger 6G", tradeOther: "Crane rigger 6G", email: null, preferredCountryCode: null, hasPassport: true, passportExpiry: "2020-01-01" });
    expect(typed.view.notes.join(" | ")).toMatch(/not in our list.*Passport expired.*Email.*not valid.*Atlantis/);
    expect(rows[7]!.reasons[0]).toMatch(/Passport expiry “31-02-2027” is not a valid date/);
  });

  it("matches an existing passport number", async () => {
    const sheet = await readCvImportWorkbook(await workbook([["Name", "Phone", "Trade", "Passport No"], ["Ravi", "9876543210", "Welder", "K1234567"]]));
    const rows = classifyCvImportRows(checkCvImportRows(sheet, lookups), { byPhone: new Map(), byPassport: new Map([["K1234567", "VSG-CV-000001"]]) });
    expect(rows[0]).toMatchObject({ status: "exists", reasons: ["Already in the CV list as VSG-CV-000001 (same passport number)"] });
  });
});
