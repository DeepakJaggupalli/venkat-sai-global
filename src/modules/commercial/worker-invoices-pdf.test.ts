import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { InvoiceDocumentView } from "./types";
import { invoicePdfFilename, invoicePdfTitle, pdfMoney, renderInvoicePdf } from "./worker-invoices-pdf";

function documentView(over: Partial<InvoiceDocumentView> = {}): InvoiceDocumentView {
  const lines = Array.from({ length: 3 }, (_, i) => ({
    id: `line-${i}`,
    description: `Recruitment service charge - Worker ${i + 1} (Pipe fitter)`,
    taxCode: "9985",
    quantity: 1,
    unitAmountMinor: 1_500_000,
    discountMinor: 0,
    amountMinor: 1_500_000,
    taxRateBasisPoints: 1800,
    taxMinor: 270_000,
    taxes: [
      { kind: "gst_cgst" as const, name: "CGST 9%", rateBasisPoints: 900, amountMinor: 135_000 },
      { kind: "gst_sgst" as const, name: "SGST 9%", rateBasisPoints: 900, amountMinor: 135_000 },
    ],
  }));
  return {
    id: "8d6f0c3e-1b2a-4c5d-9e8f-0a1b2c3d4e5f",
    code: "VSG/2627/000123",
    documentType: "invoice",
    status: "issued",
    currency: "INR",
    taxTreatment: "standard",
    placeOfSupply: "37",
    subtotalMinor: 4_500_000,
    discountMinor: 0,
    taxMinor: 810_000,
    totalMinor: 5_310_000,
    amountPaidMinor: 0,
    amountRefundedMinor: 0,
    outstandingMinor: 5_310_000,
    issuedAt: new Date("2026-11-20T06:30:00Z"),
    dueAt: new Date("2026-12-05T06:30:00Z"),
    paidAt: null,
    voidedAt: null,
    voidReason: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    purchaseOrderReference: null,
    notes: "Thank you. Workers supplied for the Jubail shutdown.",
    buyer: { legalName: "Gulf Travels Private Limited", addressLine1: "1 Beach Road", city: "Visakhapatnam", stateCode: "37", countryCode: "IN", taxIdType: "gstin", taxId: "37AAAAA0000A1Z5", email: "accounts@gulf-travels.invalid" },
    seller: { legalName: "Venkat Sai Welding Works and Testing Center", addressLine1: "B-Block, Plot D-6, Autonagar", city: "Visakhapatnam", stateCode: "37", countryCode: "IN", taxIdType: "gstin", taxId: "37ABCDE1234F1Z5" },
    lines,
    taxSummary: [
      { kind: "gst_cgst", name: "CGST 9%", rateBasisPoints: 900, taxableMinor: 4_500_000, amountMinor: 405_000 },
      { kind: "gst_sgst", name: "SGST 9%", rateBasisPoints: 900, taxableMinor: 4_500_000, amountMinor: 405_000 },
    ],
    couponCode: null,
    originalInvoice: null,
    creditNotes: [],
    payments: [],
    ...over,
  } as InvoiceDocumentView;
}

describe("invoice PDF", () => {
  it("renders a loadable A4 PDF with the document title and number", async () => {
    const bytes = await renderInvoicePdf(documentView(), { timeZone: "Asia/Kolkata", footerNote: "Subject to Visakhapatnam jurisdiction.", paymentInstructions: "Bank transfer to the account on our letterhead." });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Tax invoice VSG/2627/000123");
    const [page] = pdf.getPages();
    expect(Math.round(page!.getWidth())).toBe(595);
  });

  it("breaks long invoices over several pages and survives names outside WinAnsi", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...documentView().lines[0]!, id: `l${i}`, description: `Recruitment service charge - வேலு ராமன் ${i} (Rigger, scaffolder and general helper for refinery shutdown work)` }));
    const bytes = await renderInvoicePdf(documentView({ lines: many, status: "draft", code: null }), { timeZone: "Asia/Kolkata" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe("Draft invoice");
  });

  it("names, titles and money are explicit", () => {
    expect(invoicePdfFilename(documentView())).toBe("invoice-VSG-2627-000123.pdf");
    expect(invoicePdfFilename(documentView({ code: null }))).toBe("draft-invoice-8d6f0c3e.pdf");
    expect(invoicePdfTitle({ documentType: "invoice", status: "issued", seller: { legalName: "X", countryCode: "IN", taxId: null } })).toBe("Invoice");
    expect(invoicePdfTitle({ documentType: "credit_note", status: "issued", seller: null })).toBe("Credit note");
    expect(pdfMoney(5_310_000, "INR")).toBe("INR 53,100.00");
    expect(pdfMoney(12_345, "KWD")).toBe("KWD 12.345");
    expect(pdfMoney(150_000, "JPY")).toBe("JPY 1,50,000");
    expect(pdfMoney(-100, "AED")).toBe("-AED 1.00");
  });
});
