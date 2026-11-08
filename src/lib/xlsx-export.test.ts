import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildXlsx, describeExport, EXPORT_COMPANY_NAME, exportFilename, maskPassportNumber, neutraliseFormula } from "./xlsx-export";

type Row = { name: string; passport: string; phone: string; notes: string; created: Date };

async function load(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Passport No", value: (r: Row) => r.passport },
  { header: "Phone number(s)", value: (r: Row) => r.phone },
  { header: "Candidate notes", value: (r: Row) => r.notes, wrap: true },
  { header: "Received", value: (r: Row) => r.created },
];

describe("xlsx export helper", () => {
  const generatedAt = new Date("2026-11-08T05:30:00Z"); // 11:00 IST

  it("writes the company row, the title row and the header row before the data", async () => {
    const rows: Row[] = [
      { name: "Test Candidate", passport: maskPassportNumber("1234"), phone: "+91 90000 00001", notes: "Has TIG experience", created: generatedAt },
      { name: "Another Candidate", passport: "", phone: "", notes: "", created: generatedAt },
    ];
    const bytes = await buildXlsx({ title: "CV submissions", filters: ["Status: New"], rows, columns, generatedAt });
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe("PK");
    const sheet = await load(bytes);
    expect(sheet.getCell("A1").value).toBe(EXPORT_COMPANY_NAME);
    expect(sheet.getCell("A1").font?.bold).toBe(true);
    expect(sheet.getCell("A1").isMerged).toBe(true);
    expect(sheet.getCell("F1").master.address).toBe("A1");
    const title = String(sheet.getCell("A2").value);
    expect(title).toContain("CV submissions");
    expect(title).toContain("Filters: Status: New");
    expect(title).toContain("08 Nov 2026");
    expect(title).toContain("11:00");
    expect(title).toContain("2 rows");
    expect(sheet.getRow(3).values).toEqual([undefined, "S.No", "Name", "Passport No", "Phone number(s)", "Candidate notes", "Received"]);
    expect(sheet.getCell("A4").value).toBe(1);
    expect(sheet.getCell("B4").value).toBe("Test Candidate");
    expect(sheet.getCell("C4").value).toBe("XXXX1234");
    expect(sheet.getCell("D4").value).toBe("+91 90000 00001");
    expect(String(sheet.getCell("F4").value)).toContain("08 Nov 2026");
    expect(sheet.getCell("A5").value).toBe(2);
    expect(sheet.rowCount).toBe(5);
  });

  it("neutralises formula injection in every text cell", async () => {
    const evil: Row = { name: "=HYPERLINK(\"http://x\",\"y\")", passport: "@SUM(A1)", phone: "-2+3+cmd|' /C calc'!A0", notes: "+cmd|' /C calc'!A0", created: generatedAt };
    const sheet = await load(await buildXlsx({ title: "Test", rows: [evil], columns, generatedAt }));
    expect(sheet.getCell("B4").value).toBe("'=HYPERLINK(\"http://x\",\"y\")");
    expect(sheet.getCell("C4").value).toBe("'@SUM(A1)");
    expect(sheet.getCell("D4").value).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(sheet.getCell("E4").value).toBe("'+cmd|' /C calc'!A0");
    // No cell is ever a formula.
    sheet.eachRow((row) => row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)));
  });

  it("caps the rows and says so in the title row", async () => {
    const rows: Row[] = Array.from({ length: 7 }, (_, i) => ({ name: `Test Candidate ${i + 1}`, passport: "", phone: "", notes: "", created: generatedAt }));
    const sheet = await load(await buildXlsx({ title: "Candidates", rows, columns, generatedAt, maxRows: 5, totalRows: 12 }));
    expect(String(sheet.getCell("A2").value)).toContain("Showing the first 5 of 12 rows");
    expect(sheet.rowCount).toBe(3 + 5);
  });

  it("formats helpers", () => {
    expect(neutraliseFormula("+91 94942 63388")).toBe("+91 94942 63388");
    expect(neutraliseFormula("-5")).toBe("-5");
    expect(neutraliseFormula("=1+1")).toBe("'=1+1");
    expect(neutraliseFormula("\tcmd")).toBe("'\tcmd");
    expect(neutraliseFormula("Plain text")).toBe("Plain text");
    expect(maskPassportNumber("z1234")).toBe("XXXX1234");
    expect(maskPassportNumber(null)).toBe("");
    expect(exportFilename("CV submissions", new Date("2026-11-07T20:00:00Z"))).toBe("venkat-sai-cv-submissions-2026-11-08.xlsx");
    expect(describeExport({ title: "X", generatedAt, shown: 1, total: 1, truncated: false })).toContain("All records");
  });
});
