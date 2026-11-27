import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { defaultDocumentContent, documentContentSchema, firstName, parseDocumentContent, printDate } from "./content";
import { renderDocumentPdf } from "./render-pdf";
import { parseInternLines } from "./intern-lines";

const SIGNATORY = { name: "", title: "Authorised Signatory", place: "Visakhapatnam" };

describe("default wording", () => {
  it("builds a valid certificate and letters for an intern, without pronouns", () => {
    for (const kind of ["internship_offer_letter", "internship_certificate", "recommendation_letter"] as const) {
      const c = defaultDocumentContent(kind, { holderName: "Ravi Kumar", programme: "Welding inspection", role: "QC intern", startDate: "2026-12-01", endDate: "2027-01-26", durationWeeks: 8, online: true, stipendSentence: "This is an unpaid internship." }, SIGNATORY);
      expect(documentContentSchema.safeParse(c).success).toBe(true);
      expect(c.body).toContain("Welding inspection");
      expect(c.body).not.toMatch(/\b(he|she|his|her|him)\b/i);
    }
    const offer = defaultDocumentContent("internship_offer_letter", { holderName: "Ravi Kumar", programme: "X", stipendSentence: "This is an unpaid internship." }, SIGNATORY);
    expect(offer.body).toContain("unpaid");
  });

  it("uses the performance note in the LOR when given", () => {
    const c = defaultDocumentContent("recommendation_letter", { holderName: "Sita Devi", programme: "NDT", performanceNote: "Sita read radiographs carefully." }, SIGNATORY);
    expect(c.body).toContain("Sita read radiographs carefully.");
  });

  it("formats dates and first names", () => {
    expect(printDate("2026-12-01")).toBe("1 December 2026");
    expect(firstName("  Ravi  Kumar ")).toBe("Ravi");
  });

  it("opens damaged stored content for editing instead of failing", () => {
    const c = parseDocumentContent({ title: 5 }, { holderName: "A B", kind: "course_certificate" });
    expect(c.holderName).toBe("A B");
    expect(c.title).toBe("Certificate of Completion");
  });
});

describe("pasted intern lines", () => {
  it("reads name, phone, email and college in any order", () => {
    const { rows, errors } = parseInternLines("Ravi Kumar, 9876543210, ravi@example.com, GITAM\nSita Devi\tsita@example.com\n,\nX");
    expect(rows[0]).toEqual({ fullName: "Ravi Kumar", email: "ravi@example.com", phone: "+919876543210", institutionName: "GITAM" });
    expect(rows[1]).toMatchObject({ fullName: "Sita Devi", email: "sita@example.com" });
    expect(errors).toHaveLength(2);
  });
});

describe("PDF", () => {
  it("renders a certificate (1 landscape page) and a long letter (more pages) with names in other scripts", async () => {
    const base = { code: "VSG-DOC-000001", verificationCodeDisplay: "ABCD-EFGH-JKMN", verifyUrl: "https://example.test/verify-certificate/ABCD-EFGH-JKMN", fallbackIssueDate: "2026-11-27", draft: true };
    const cert = await renderDocumentPdf({ ...base, kind: "course_certificate", content: defaultDocumentContent("course_certificate", { holderName: "రవి Kumar", programme: "6G welding", durationHours: 40 }, SIGNATORY) });
    const certDoc = await PDFDocument.load(cert);
    expect(certDoc.getPageCount()).toBe(1);
    expect(certDoc.getPage(0).getWidth()).toBeGreaterThan(certDoc.getPage(0).getHeight());

    const content = defaultDocumentContent("recommendation_letter", { holderName: "Ravi Kumar", programme: "NDT" }, SIGNATORY);
    const letter = await renderDocumentPdf({ ...base, draft: false, kind: "recommendation_letter", content: { ...content, body: Array.from({ length: 14 }, () => "A long paragraph about the work done during the internship. ".repeat(4)).join("\n\n") } });
    const letterDoc = await PDFDocument.load(letter);
    expect(letterDoc.getPageCount()).toBeGreaterThan(1);
  });
});
