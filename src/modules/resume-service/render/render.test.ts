import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { resumeDetailsSchema, type ResumeDetails } from "../schemas";
import { renderResumeDocx } from "./docx";
import { buildResumeModel } from "./model";
import { renderResumePdf } from "./pdf";

const today = new Date("2026-11-08T00:00:00.000Z");

function details(overrides: Record<string, unknown> = {}): ResumeDetails {
  return resumeDetailsSchema.parse({
    postAppliedFor: "TIG Welder",
    name: "Test Candidate",
    fatherName: "Test Father",
    dateOfBirth: "1990-04-15",
    maritalStatus: "Married",
    educationQualification: "SSC",
    technicalQualification: "ITI Welder (2 years), 6G TIG/ARC certified",
    nationality: "Indian",
    languages: "English, Hindi, Telugu",
    permanentAddress: "Door No. 1-2-3\nTest Street, Gajuwaka\nVisakhapatnam 530012",
    contactPhone: "+919000000001",
    alternatePhone: "+919000000002",
    email: "test.candidate@example.com",
    passport: { number: "T1234567", dateOfIssue: "2020-01-10", dateOfExpiry: "2030-01-09", placeOfIssue: "Visakhapatnam" },
    abroadExperience: [
      { organisation: "Test Gulf Contracting Co.", location: "Jubail, Saudi Arabia", from: "2016-01-01", to: "2017-12-31", designation: "TIG Welder" },
      { organisation: "Test Fabrication LLC", location: "Dubai, UAE", from: "2018-02-01", to: "2019-01-31", designation: "Welder" },
      { organisation: "Test Offshore Ltd", location: "Doha, Qatar", from: "2024-10-09", current: true, designation: "Senior TIG Welder" },
    ],
    indiaExperience: [
      { organisation: "Test Engineering Works", location: "Visakhapatnam, India", from: "2008-01-01", to: "2011-12-31", designation: "Helper" },
      { organisation: "Test Steel Plant Contractor", location: "Visakhapatnam, India", from: "2012-01-01", to: "2015-12-31", designation: "Welder" },
      { organisation: "Test Shipyard Contractor", location: "Kakinada, India", from: "2020-01-01", to: "2023-12-31", designation: "Welder" },
    ],
    declaration: { include: true, place: "Visakhapatnam" },
    ...overrides,
  });
}

async function photo(): Promise<Uint8Array> {
  const buf = await sharp({ create: { width: 140, height: 180, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

const ascii = (bytes: Uint8Array, n: number) => Buffer.from(bytes.subarray(0, n)).toString("latin1");

describe("buildResumeModel", () => {
  it("lists the rows in the business's order and omits an empty religion", () => {
    const model = buildResumeModel(details(), { today });
    expect(model.rows.map((r) => r.label)).toEqual([
      "POST APPLIED FOR",
      "NAME",
      "FATHER NAME",
      "DATE OF BIRTH",
      "MARITAL STATUS",
      "EDUCATION QUALIFICATION",
      "TECHNICAL QUALIFICATION",
      "NATIONALITY",
      "LANGUAGES",
      "PERMANENT ADDRESS",
      "CONTACT",
      "EMAIL ID",
    ]);
    expect(model.rows.find((r) => r.label === "DATE OF BIRTH")?.value).toBe("15.04.1990");
    expect(model.rows.find((r) => r.label === "CONTACT")?.value).toBe("+91 90000 00001 / +91 90000 00002");
    expect(model.passportValues).toEqual(["T1234567", "10.01.2020", "09.01.2030", "Visakhapatnam"]);
    expect(model.experience.map((s) => s.title)).toEqual(["Experience in Abroad :", "EXPERIENCE IN INDIA:"]);
    expect(model.experience[0]!.rows[2]).toMatchObject({ sl: "3", organisation: "Test Offshore Ltd, Doha, Qatar", from: "09.10.2024", to: "Still Continue" });
    // 24 + 12 + 25 (to 08.11.2026) = 61 months
    expect(model.experience[0]!.total).toBe("05 Years 1 Month");
    expect(model.experience[1]!.total).toBe("12 YEARS");
  });

  it("keeps the religion row when given and drops empty experience sections", () => {
    const model = buildResumeModel(details({ religion: "Hindu", indiaExperience: [] }), { today });
    expect(model.rows.find((r) => r.label === "RELIGION")?.value).toBe("Hindu");
    expect(model.experience.map((s) => s.key)).toEqual(["abroad"]);
  });

  it("builds a blank template with every label and empty values", () => {
    const model = buildResumeModel(null);
    expect(model.blank).toBe(true);
    expect(model.rows).toHaveLength(13);
    expect(model.rows.every((r) => r.value === "")).toBe(true);
    expect(model.experience).toHaveLength(2);
    expect(model.declaration).not.toBeNull();
  });
});

describe("renderResumeDocx", () => {
  it("produces a Word document", async () => {
    const bytes = await renderResumeDocx(details(), { photoJpeg: await photo(), today });
    expect(ascii(bytes, 2)).toBe("PK");
    expect(Buffer.from(bytes).includes("word/document.xml")).toBe(true);
    expect(Buffer.from(bytes).includes("word/media/")).toBe(true);
  });

  it("produces the blank template", async () => {
    const bytes = await renderResumeDocx(null);
    expect(ascii(bytes, 2)).toBe("PK");
    expect(Buffer.from(bytes).includes("word/document.xml")).toBe(true);
  });
});

describe("renderResumePdf", () => {
  it("produces a one or two page PDF for a typical resume", async () => {
    const bytes = await renderResumePdf(details(), { photoJpeg: await photo(), today });
    expect(ascii(bytes, 5)).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getPageCount()).toBeLessThanOrEqual(2);
    expect(doc.getTitle()).toBe("Resume - Test Candidate");
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("fits the blank template on one page", async () => {
    const doc = await PDFDocument.load(await renderResumePdf(null));
    expect(doc.getPageCount()).toBe(1);
  });

  it("does not fail on names outside the standard font", async () => {
    const bytes = await renderResumePdf(details({ name: "Šrīnivās Ünal వెంకట" }), { today });
    expect(ascii(bytes, 5)).toBe("%PDF-");
    await expect(renderResumeDocx(details({ name: "Šrīnivās" }), { today })).resolves.toBeInstanceOf(Uint8Array);
  });

  it("breaks long tables across pages and repeats the header", async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      organisation: `Test Company ${i + 1} with a fairly long registered name for wrapping`,
      location: "Jubail, Saudi Arabia",
      from: `${2000 + i}-01-01`,
      to: `${2000 + i}-12-31`,
      designation: "Pipe Fitter",
    }));
    const doc = await PDFDocument.load(await renderResumePdf(details({ abroadExperience: many, indiaExperience: many }), { today }));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
