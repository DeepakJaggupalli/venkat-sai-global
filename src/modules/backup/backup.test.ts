import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { EXPORT_COMPANY_NAME } from "@/lib/xlsx-export";
import { CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import { RECURRING_TASKS } from "@/server/tasks/schedule";

import { CV_BACKUP_HEADERS, cvBackupColumns, organisationTypeLabel, passportCell, payoutBackupColumns, type CvBackupRow } from "./columns";
import { buildBackupEmail, sheetLine } from "./email";
import { BACKUP_DAILY_TASK, BACKUP_MAX_ROWS_PER_SHEET, backupSettingsSchema, dailyRunKey, isoDateInZone, resolveBackupRecipient } from "./schemas";
import { tasks } from "./tasks";
import { backupCellValue, cleanSheetName, prepareSheet, writeBackupWorkbook, type BackupSheet } from "./workbook";

async function load(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb;
}

type Row = { name: string; phone: string; notes: string; when: Date; count: number };
const generatedAt = new Date("2026-11-23T00:30:00Z"); // 06:00 IST
const row = (i: number, overrides: Partial<Row> = {}): Row => ({ name: `Test Person ${i}`, phone: "+91 90000 00001", notes: "", when: generatedAt, count: i, ...overrides });
const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Phone", value: (r: Row) => r.phone },
  { header: "Notes", value: (r: Row) => r.notes, wrap: true },
  { header: "When", value: (r: Row) => r.when },
  { header: "Count", value: (r: Row) => r.count },
];
const sheet = (name: string, rows: Row[], total = rows.length): BackupSheet<Row> => ({ sheetName: name, title: `${name} title`, rows, total, columns });

const cvRow = (overrides: Partial<CvBackupRow> = {}): CvBackupRow => ({
  code: "VSG-CV-000123",
  name: "Ravi Kumar",
  phone: "+919876543210",
  email: "ravi.kumar@example.com",
  tradeLabel: "TIG welder",
  experienceYears: 8,
  experienceAbroadYears: 5,
  experienceIndiaYears: 3,
  countryName: "Qatar",
  requirementTitle: "Pipe welders for Qatar",
  status: "trade_test",
  source: "website",
  createdAt: generatedAt,
  passportExpiry: "2028-01-31",
  hasPassport: true,
  passportLast4: "4567",
  passportFull: null,
  candidateNotes: "6G certified",
  staffRemarks: "Good welder",
  hasCv: true,
  referralCode: "7KQ2MX",
  placedWith: null,
  ...overrides,
});

describe("backup workbook", () => {
  it("writes one sheet per area, in order, each with the company row, the title row and the S.No header", async () => {
    const { bytes, sheets } = await writeBackupWorkbook({
      sheets: [prepareSheet(sheet("CV submissions", [row(1), row(2)])), prepareSheet(sheet("Bookings", [row(3)])), prepareSheet(sheet("Leads", []))],
      generatedAt,
    });
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe("PK");
    expect(sheets.map((s) => [s.sheetName, s.rows, s.truncated])).toEqual([
      ["CV submissions", 2, false],
      ["Bookings", 1, false],
      ["Leads", 0, false],
    ]);

    const wb = await load(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["CV submissions", "Bookings", "Leads"]);
    const cv = wb.getWorksheet("CV submissions")!;
    expect(cv.getCell("A1").value).toBe(EXPORT_COMPANY_NAME);
    expect(cv.getCell("A1").font?.bold).toBe(true);
    expect(cv.getCell("F1").master.address).toBe("A1");
    const title = String(cv.getCell("A2").value);
    expect(title).toContain("CV submissions title");
    expect(title).toContain("All records");
    expect(title).toContain("23 Nov 2026");
    expect(title).toContain("06:00");
    expect(title).toContain("2 rows");
    expect(cv.getRow(3).values).toEqual([undefined, "S.No", "Name", "Phone", "Notes", "When", "Count"]);
    expect(cv.getCell("A4").value).toBe(1);
    expect(cv.getCell("B4").value).toBe("Test Person 1");
    expect(cv.getCell("C4").value).toBe("+91 90000 00001");
    expect(String(cv.getCell("E4").value)).toContain("23 Nov 2026");
    expect(cv.getCell("F5").value).toBe(2);
    expect(cv.getCell("B4").numFmt).toBe("@");
    expect(cv.rowCount).toBe(5);
    // An empty area still gets its sheet, with the header row and "0 rows".
    const leads = wb.getWorksheet("Leads")!;
    expect(String(leads.getCell("A2").value)).toContain("0 rows");
    expect(leads.getRow(3).values).toEqual([undefined, "S.No", "Name", "Phone", "Notes", "When", "Count"]);
  });

  it("neutralises formula injection in every text cell", async () => {
    const evil = row(1, { name: '=HYPERLINK("http://x","y")', phone: "@SUM(A1)", notes: "+cmd|' /C calc'!A0" });
    const wb = await load((await writeBackupWorkbook({ sheets: [prepareSheet(sheet("Evil", [evil]))], generatedAt })).bytes);
    const ws = wb.worksheets[0]!;
    expect(ws.getCell("B4").value).toBe('\'=HYPERLINK("http://x","y")');
    expect(ws.getCell("C4").value).toBe("'@SUM(A1)");
    expect(ws.getCell("D4").value).toBe("'+cmd|' /C calc'!A0");
    ws.eachRow((r) => r.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)));
  });

  it("caps each sheet and says so in its title row", async () => {
    const prepared = prepareSheet(sheet("Big", Array.from({ length: 5 }, (_, i) => row(i + 1)), 12), { maxRows: 3 });
    expect(prepared).toMatchObject({ shown: 3, total: 12, truncated: true });
    const { bytes, sheets } = await writeBackupWorkbook({ sheets: [prepared], generatedAt });
    expect(sheets[0]).toMatchObject({ rows: 3, total: 12, truncated: true });
    const ws = (await load(bytes)).worksheets[0]!;
    expect(String(ws.getCell("A2").value)).toContain("Showing the first 3 of 12 rows");
    expect(ws.rowCount).toBe(3 + 3);
    expect(BACKUP_MAX_ROWS_PER_SHEET).toBe(20_000);
    // Without an explicit cap the default applies.
    expect(prepareSheet(sheet("Small", [row(1)])).truncated).toBe(false);
  });

  it("builds lazy sheets one at a time, in order, with unique tab names", async () => {
    const calls: string[] = [];
    const lazy = (name: string) => async () => {
      calls.push(name);
      return prepareSheet(sheet(name, [row(1)]));
    };
    const { sheets } = await writeBackupWorkbook({ sheets: [lazy("Leads"), lazy("leads"), lazy("Enquiries")], generatedAt });
    expect(calls).toEqual(["Leads", "leads", "Enquiries"]);
    expect(sheets.map((s) => s.sheetName)).toEqual(["Leads", "leads (2)", "Enquiries"]);
  });

  it("cleans tab names and cell values", () => {
    expect(cleanSheetName("Applicants: Qatar / Dubai [6G]?")).toBe("Applicants Qatar Dubai 6G");
    expect(cleanSheetName("x".repeat(40))).toHaveLength(31);
    expect(cleanSheetName("  ")).toBe("Sheet");
    expect(backupCellValue(null)).toBe("");
    expect(backupCellValue(Number.NaN)).toBe("");
    expect(backupCellValue(7)).toBe(7);
    expect(backupCellValue("a\r\nb")).toBe("a\nb");
    expect(backupCellValue("=1+1")).toBe("'=1+1");
    expect(String(backupCellValue("y".repeat(40_000))).length).toBe(32_000);
  });
});

describe("backup columns", () => {
  it("has the CV columns in the order the business asked for", () => {
    expect(CV_BACKUP_HEADERS.slice(0, 16)).toEqual([
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
    ]);
    expect(cvBackupColumns({ fullPassport: false, fullContact: true }).map((c) => c.header)).toEqual([...CV_BACKUP_HEADERS]);
  });

  it("masks passport numbers unless full numbers are allowed and present", () => {
    const value = (fullPassport: boolean, fullContact: boolean, r: CvBackupRow) =>
      Object.fromEntries(cvBackupColumns({ fullPassport, fullContact }).map((c) => [c.header, c.value(r)]));
    const masked = value(false, true, cvRow({ passportFull: "Z1234567" }));
    expect(masked["Passport No"]).toBe("XXXX4567");
    expect(masked.Phone).toBe("+919876543210");
    expect(masked.Email).toBe("ravi.kumar@example.com");
    expect(masked.Status).toBe(CV_SUBMISSION_STATUS_LABELS.trade_test);
    expect(masked.Source).toBe("Website");
    expect(masked["Applied for"]).toBe("Pipe welders for Qatar");
    expect(masked["CV file"]).toBe("Yes");

    expect(value(true, true, cvRow({ passportFull: "Z1234567" }))["Passport No"]).toBe("Z1234567");
    // Allowed, but the number could not be decrypted: still never more than the last 4.
    expect(value(true, true, cvRow({ passportFull: null }))["Passport No"]).toBe("XXXX4567");
    expect(value(false, true, cvRow({ passportLast4: null, hasPassport: false }))["Passport No"]).toBe("No passport");
    expect(value(false, true, cvRow({ requirementTitle: null, countryName: null }))).toMatchObject({ "Applied for": "General (no requirement)", "Preferred country": "Any" });

    const noContact = value(false, false, cvRow());
    expect(noContact.Phone).not.toContain("98765");
    expect(noContact.Email).not.toBe("ravi.kumar@example.com");
    expect(passportCell({ fullPassport: false, fullContact: true }, { passportFull: "Z1234567", passportLast4: "4567" })).toBe("XXXX4567");
  });

  it("always shows money with its own currency, and organisation kinds in plain words", () => {
    const [amount] = payoutBackupColumns()
      .filter((c) => c.header === "Amount paid")
      .map((c) => c.value({ cvCode: "VSG-CV-1", cvName: "A", referrerName: "B", referrerCode: "7KQ2MX", amountMinor: 150_000, currency: "AED", paidAt: generatedAt, paidByName: null, note: null }));
    expect(String(amount)).toMatch(/AED|د\.إ/);
    expect(String(amount)).toContain("1,500");
    expect(organisationTypeLabel("employer", "travel_agency")).toBe("Travel agency");
    expect(organisationTypeLabel("employer", "direct_company")).toBe("Company / HR");
    expect(organisationTypeLabel("recruitment_partner", null)).toBe("Recruitment partner");
  });
});

describe("backup email", () => {
  const sheets = [
    { sheetName: "CV submissions", title: "CV submissions and applicants", rows: 1234, total: 1234, truncated: false },
    { sheetName: "Leads", title: "Leads", rows: 1, total: 1, truncated: false },
    { sheetName: "Enquiries", title: "Enquiries", rows: 20_000, total: 23_456, truncated: true },
  ];
  const base = { dayLabel: "23 Nov 2026", filename: "venkat-sai-full-backup-2026-11-23.xlsx", sizeBytes: 1_258_291, sheets, pageUrl: "https://example.test/admin/system/backup", appUrl: "https://example.test" };

  it("says what is attached, what is inside and that passport numbers are cut", () => {
    const email = buildBackupEmail({ ...base, attached: true, trigger: "daily" });
    expect(email.subject).toBe("Daily backup of your business data, 23 Nov 2026");
    expect(email.text).toContain("venkat-sai-full-backup-2026-11-23.xlsx (1.2 MB)");
    expect(email.text).toContain("CV submissions: 1,234 rows");
    expect(email.text).toContain("Leads: 1 row");
    expect(email.text).toContain("Enquiries: 20,000 rows (first 20,000 of 23,456)");
    expect(email.text).toContain("last 4 digits");
    expect(email.text).toContain("Do not forward it");
    expect(email.html).toContain("https://example.test/admin/system/backup");
    expect(email.html).toContain("daily backup is switched on");
  });

  it("points at the download page when the file is too big to attach, and labels a manual backup", () => {
    const email = buildBackupEmail({ ...base, attached: false, trigger: "manual" });
    expect(email.subject).toBe("Backup of your business data, 23 Nov 2026");
    expect(email.text).toContain("too large to send by email");
    expect(email.text).not.toContain("is attached");
    expect(email.html).toContain("someone asked for a backup");
  });

  it("escapes values in the HTML", () => {
    const email = buildBackupEmail({ ...base, attached: true, trigger: "daily", sheets: [{ sheetName: "<b>x</b>", title: "t", rows: 1, total: 1, truncated: false }] });
    expect(email.html).not.toContain("<b>x</b>");
    expect(sheetLine({ sheetName: "Leads", title: "Leads", rows: 0, total: 0, truncated: false })).toBe("Leads: 0 rows");
  });
});

describe("backup settings and schedule", () => {
  it("sends to the backup address, else the business inbox, else nowhere", () => {
    expect(resolveBackupRecipient("", "vsweld@gmail.com")).toEqual({ email: "vsweld@gmail.com", source: "business_inbox" });
    expect(resolveBackupRecipient(" Owner@Example.com ", "vsweld@gmail.com")).toEqual({ email: "owner@example.com", source: "backup" });
    expect(resolveBackupRecipient("", "")).toBeNull();
    expect(resolveBackupRecipient("not an email", "vsweld@gmail.com")).toBeNull();
    // One address only: lists and display names are refused, never split.
    expect(resolveBackupRecipient("a,b@example.com", "")).toBeNull();
    expect(resolveBackupRecipient('"Owner" <owner@example.com>', "")).toBeNull();
    expect(resolveBackupRecipient("", "a@example.com, b@example.com")).toBeNull();
  });

  it("validates the settings form (checkbox, optional address)", () => {
    expect(backupSettingsSchema.parse({ dailyEmail: "on", emailTo: " Owner@Example.com " })).toEqual({ dailyEmail: true, emailTo: "owner@example.com" });
    expect(backupSettingsSchema.parse({})).toEqual({ dailyEmail: false, emailTo: "" });
    expect(backupSettingsSchema.safeParse({ dailyEmail: "on", emailTo: "nope" }).success).toBe(false);
  });

  it("keys a daily run by the scheduler's UTC day, and labels days in India time", () => {
    expect(dailyRunKey("2026-11-23T00:00:05.000Z", new Date("2026-11-23T09:00:00Z"))).toBe("2026-11-23");
    expect(dailyRunKey(undefined, new Date("2026-11-23T20:00:00Z"))).toBe("2026-11-23");
    expect(dailyRunKey("garbage", new Date("2026-11-24T01:00:00Z"))).toBe("2026-11-24");
    expect(isoDateInZone(new Date("2026-11-23T20:00:00Z"))).toBe("2026-11-24");
  });

  it("registers backup.daily_email as a daily task, like documents.expiry_alerts", async () => {
    const entry = RECURRING_TASKS.find((t) => t.type === BACKUP_DAILY_TASK);
    const expiry = RECURRING_TASKS.find((t) => t.type === "documents.expiry_alerts");
    expect(entry).toBeDefined();
    expect(entry!.everyMinutes).toBe(1440);
    expect(entry!.everyMinutes).toBe(expiry!.everyMinutes);
    expect(typeof tasks[BACKUP_DAILY_TASK]).toBe("function");

    // The handler runs the service with the scheduler's payload and logs the outcome.
    vi.doMock("./service", () => ({ runDailyBackupEmail: vi.fn(async () => ({ status: "disabled" })) }));
    const log = vi.fn();
    await tasks[BACKUP_DAILY_TASK]!({ scheduledFor: "2026-11-23T00:00:05.000Z" }, { taskId: 1, attempt: 1, log });
    const service = await import("./service");
    expect(service.runDailyBackupEmail).toHaveBeenCalledWith({ scheduledFor: "2026-11-23T00:00:05.000Z" });
    expect(log).toHaveBeenCalledWith("Daily backup email finished", { status: "disabled" });
    vi.doUnmock("./service");
  });
});
