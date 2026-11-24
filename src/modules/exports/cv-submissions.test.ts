import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// The column helpers never query; keep the database client out of this unit test.
vi.mock("@/db", () => ({ db: {}, pool: {} }));

const { buildXlsx, EXPORT_COMPANY_NAME } = await import("@/lib/xlsx-export");
const { CV_SUBMISSION_EXPORT_HEADERS, cvSubmissionExportColumns } = await import("./cv-submissions");
type Row = import("@/modules/operations/cv-submissions").CvSubmissionExportRow;

const row: Row = {
  code: "VSG-CV-000123",
  name: "Test Candidate",
  phone: "+919876543210",
  email: "test.candidate@example.com",
  tradeLabel: "Mechanical helper",
  experienceYears: 8,
  experienceAbroadYears: 5,
  experienceIndiaYears: 3,
  countryName: "United Arab Emirates",
  requirementTitle: "Dubai - Mechanical helper",
  status: "contacted",
  passportEncrypted: null,
  passportLast4: "4567",
  hasPassport: true,
  passportExpiry: "2030-05-01",
  candidateNotes: "Gulf experience",
  staffRemarks: "Called on Monday",
  source: "website",
  hasCv: false,
  createdAt: new Date("2026-11-20T06:30:00Z"),
};

async function sheetOf(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

describe("CV submissions / applicants Excel columns", () => {
  it("puts the columns in the order the business asked for, after S.No", async () => {
    const columns = cvSubmissionExportColumns({ fullPhone: true, fullPassport: false });
    expect(columns.map((c) => c.header)).toEqual([...CV_SUBMISSION_EXPORT_HEADERS]);
    const bytes = await buildXlsx({ title: "Applicants: Dubai - Mechanical helper", rows: [row], columns, generatedAt: new Date("2026-11-21T05:30:00Z") });
    const sheet = await sheetOf(bytes);
    expect(sheet.getCell("A1").value).toBe(EXPORT_COMPANY_NAME);
    expect((sheet.getRow(3).values as unknown[]).slice(1)).toEqual([
      "S.No",
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
      // After the requested columns: nothing the older download had is lost.
      "Total exp (yrs)",
      "Reference",
    ]);
    const values = (sheet.getRow(4).values as unknown[]).slice(1);
    expect(values.slice(0, 9)).toEqual([1, "Test Candidate", "Mechanical helper", "XXXX4567", 5, 3, "test.candidate@example.com", "+919876543210", "Dubai - Mechanical helper"]);
    expect(String(values[9])).toContain("20 Nov 2026");
    expect(values.slice(10)).toEqual(["Contacted", "United Arab Emirates", "2030-05-01", "Gulf experience", "Called on Monday", 8, "VSG-CV-000123"]);
  });

  it("keeps the experience of people who applied before it was split into abroad and India", () => {
    const columns = cvSubmissionExportColumns({ fullPhone: true, fullPassport: false });
    const value = (header: string, r: Row) => columns.find((c) => c.header === header)!.value(r);
    const older = { ...row, experienceAbroadYears: null, experienceIndiaYears: null, experienceYears: 7 };
    expect(value("Exp Abroad (yrs)", older)).toBeNull();
    expect(value("Exp India (yrs)", older)).toBeNull();
    expect(value("Total exp (yrs)", older)).toBe(7);
    expect(value("Reference", older)).toBe("VSG-CV-000123");
  });

  it("masks phone and email without the contact permission and says when there is no requirement", () => {
    const columns = cvSubmissionExportColumns({ fullPhone: false, fullPassport: false });
    const value = (header: string, r: Row) => columns.find((c) => c.header === header)!.value(r);
    expect(value("Phone", row)).toBe("+91 ******3210");
    expect(value("Email", row)).toBe("t***@example.com");
    expect(value("Passport No", row)).toBe("XXXX4567");
    expect(value("Applied for", { ...row, requirementTitle: null })).toBe("General (no requirement)");
    expect(value("Passport No", { ...row, passportLast4: null, hasPassport: false })).toBe("No passport");
    expect(value("Exp Abroad (yrs)", { ...row, experienceAbroadYears: null })).toBeNull();
  });
});
