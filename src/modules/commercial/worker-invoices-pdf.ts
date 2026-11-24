/**
 * Invoice / credit note as a PDF file (pdf-lib, standard Helvetica fonts, A4), the same content as the printable page
 * (/billing/invoices/[id]): frozen seller and buyer snapshots, frozen lines and tax components, totals, payments,
 * notes. Pure: no database access, so it can be unit-tested; callers authorise and load the document.
 *
 * The standard fonts only encode WinAnsi: every string is sanitised (accents folded, anything else "?"), and money is
 * written as "INR 45,000.00" (the rupee sign is not in WinAnsi) — always with the document's own currency.
 */
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import type { InvoicePartySnapshot } from "@/db/schema/commercial";
import { formatDate } from "@/lib/format";

import { placeOfSupplyLabel } from "./constants";
import { minorUnitsFor } from "./money";
import { formatRate } from "./tax";
import type { InvoiceDocumentView } from "./types";

export type InvoicePdfOptions = {
  /** Viewer's time zone for dates. */
  timeZone: string;
  /** `commercial.invoice_prefix_note` (footer). */
  footerNote?: string | null;
  /** Offline payment instructions (bank / UPI) printed on unpaid invoices. */
  paymentInstructions?: string | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_H = 28;

const INK = rgb(0.039, 0.039, 0.043);
const MUTED = rgb(0.357, 0.38, 0.439);
const LINE = rgb(0.914, 0.922, 0.937);
const ACCENT = rgb(0.055, 0.647, 0.914);

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  partially_paid: "Partially paid",
  void: "Void",
  overdue: "Overdue",
  refunded: "Refunded",
};

const TREATMENT_NOTES: Record<string, string> = {
  export: "Export of services - zero-rated supply.",
  sez: "Supply to an SEZ unit - zero-rated supply.",
  exempt: "Exempt supply - no tax charged.",
  reverse_charge: "Tax on this supply is payable by the recipient under reverse charge.",
};

/** "Tax invoice" for a GST-registered seller in India, "Invoice" otherwise; drafts and credit notes say so. */
export function invoicePdfTitle(doc: Pick<InvoiceDocumentView, "documentType" | "status" | "seller">): string {
  if (doc.documentType === "credit_note") return "Credit note";
  if (doc.status === "draft") return "Draft invoice";
  return doc.seller?.countryCode === "IN" && doc.seller?.taxId ? "Tax invoice" : "Invoice";
}

/** invoice-VSG-2627-000123.pdf (drafts: draft-invoice-<id prefix>.pdf). */
export function invoicePdfFilename(doc: Pick<InvoiceDocumentView, "code" | "documentType" | "id">): string {
  const kind = doc.documentType === "credit_note" ? "credit-note" : "invoice";
  if (!doc.code) return `draft-${kind}-${doc.id.slice(0, 8)}.pdf`;
  return `${kind}-${doc.code.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}

/** A private, non-cached PDF download. */
export function invoicePdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** "INR 1,50,000.00", "KWD 12.345", "JPY 150,000" — en-IN grouping like the rest of the site. */
export function pdfMoney(amountMinor: number, currency: string): string {
  const units = minorUnitsFor(currency);
  const value = new Intl.NumberFormat("en-IN", { minimumFractionDigits: units, maximumFractionDigits: units }).format(Math.abs(amountMinor) / 10 ** units);
  return `${amountMinor < 0 ? "-" : ""}${currency} ${value}`;
}

function sanitizer(font: PDFFont): (input: string) => string {
  const allowed = new Set(font.getCharacterSet());
  return (input: string) => {
    let out = "";
    for (const ch of input.replace(/\r\n?/g, "\n").replace(/\t/g, " ")) {
      if (ch === "\n" || allowed.has(ch.codePointAt(0)!)) {
        out += ch;
        continue;
      }
      const folded = ch.normalize("NFKD").replace(/\p{M}/gu, "");
      out += folded && [...folded].every((c) => allowed.has(c.codePointAt(0)!)) ? folded : "?";
    }
    return out;
  };
}

type Style = { font: PDFFont; size: number; color?: ReturnType<typeof rgb> };

class Writer {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];
  readonly clean: (s: string) => string;

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly watermark: string | null,
  ) {
    this.clean = sanitizer(regular);
    this.addPage();
  }

  addPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
    if (this.watermark) {
      this.page.drawText(this.watermark, { x: 150, y: 300, size: 110, font: this.bold, color: MUTED, opacity: 0.09, rotate: degrees(30) });
    }
  }

  /** New page when `height` does not fit above the footer; true when a page was added. */
  ensure(height: number): boolean {
    if (this.y - height >= MARGIN + FOOTER_H) return false;
    this.addPage();
    return true;
  }

  width(text: string, style: Style): number {
    return style.font.widthOfTextAtSize(text, style.size);
  }

  wrap(text: string, style: Style, width: number): string[] {
    const out: string[] = [];
    for (const paragraph of this.clean(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.width(candidate, style) <= width) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        if (this.width(word, style) <= width) {
          line = word;
          continue;
        }
        let chunk = "";
        for (const ch of word) {
          if (chunk && this.width(chunk + ch, style) > width) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
      out.push(line);
    }
    return out.length ? out : [""];
  }

  /** Draw one line whose baseline sits `size` below `top`; align within [x, x + width]. */
  line(text: string, style: Style, x: number, top: number, opts: { width?: number; align?: "left" | "right" } = {}): void {
    const clean = this.clean(text);
    const w = this.width(clean, style);
    const left = opts.align === "right" && opts.width !== undefined ? x + opts.width - w : x;
    this.page.drawText(clean, { x: left, y: top - style.size, size: style.size, font: style.font, color: style.color ?? INK });
  }

  rule(top: number, color = LINE, thickness = 0.75, x = MARGIN, width = CONTENT_W): void {
    this.page.drawRectangle({ x, y: top - thickness, width, height: thickness, color });
  }
}

const S = (w: Writer) => ({
  label: { font: w.bold, size: 7.5, color: MUTED } satisfies Style,
  body: { font: w.regular, size: 9 } satisfies Style,
  bodyBold: { font: w.bold, size: 9 } satisfies Style,
  small: { font: w.regular, size: 7.5, color: MUTED } satisfies Style,
  name: { font: w.bold, size: 11 } satisfies Style,
  title: { font: w.bold, size: 20 } satisfies Style,
  number: { font: w.bold, size: 11 } satisfies Style,
  total: { font: w.bold, size: 11 } satisfies Style,
});

function partyLines(party: InvoicePartySnapshot | null): { name: string | null; lines: string[] } {
  if (!party) return { name: null, lines: ["Details are added when the invoice is issued."] };
  const cityLine = [party.city, party.stateRegion, party.postalCode].filter(Boolean).join(", ");
  const lines = [
    party.contactName ? `Attn: ${party.contactName}` : null,
    party.addressLine1 ?? null,
    party.addressLine2 ?? null,
    cityLine || null,
    party.countryCode ?? null,
    party.stateCode && party.countryCode === "IN" ? `State code: ${placeOfSupplyLabel(party.stateCode)}` : null,
    party.taxId ? `${party.taxIdType === "gstin" ? "GSTIN" : (party.taxIdType?.toUpperCase() ?? "Tax ID")}: ${party.taxId}` : null,
    party.email ?? null,
    party.phone ?? null,
  ].filter((v): v is string => Boolean(v));
  return { name: party.legalName, lines };
}

/** Draws a labelled party block at (x, top) within `width`; returns its height. */
function drawParty(w: Writer, heading: string, party: InvoicePartySnapshot | null, x: number, top: number, width: number): number {
  const st = S(w);
  let y = top;
  w.line(heading.toUpperCase(), st.label, x, y);
  y -= 13;
  const { name, lines } = partyLines(party);
  if (name) {
    for (const l of w.wrap(name, st.name, width)) {
      w.line(l, st.name, x, y);
      y -= 14;
    }
  }
  for (const text of lines) {
    for (const l of w.wrap(text, party ? st.body : st.small, width)) {
      w.line(l, party ? st.body : st.small, x, y);
      y -= 12;
    }
  }
  return top - y;
}

type Column = { key: string; header: string; width: number; align: "left" | "right" };

/** Render the document. Multi-page: the line table repeats its header after a page break; every page is numbered. */
export async function renderInvoicePdf(doc: InvoiceDocumentView, opts: InvoicePdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const title = invoicePdfTitle(doc);
  pdf.setTitle(`${title}${doc.code ? ` ${doc.code}` : ""}`);
  pdf.setAuthor(doc.seller?.legalName ?? "Venkat Sai Global");
  pdf.setCreator("Venkat Sai Global");
  pdf.setProducer("Venkat Sai Global");
  pdf.setCreationDate(doc.issuedAt ?? new Date());
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const watermark = doc.status === "draft" ? "DRAFT" : doc.status === "void" ? "VOID" : null;
  const w = new Writer(pdf, regular, bold, watermark);
  const st = S(w);
  const money = (minor: number) => pdfMoney(minor, doc.currency);
  const date = (d: Date | null) => (d ? formatDate(d, { timeZone: opts.timeZone }) : null);
  const isCredit = doc.documentType === "credit_note";
  const gstInvoice = title === "Tax invoice" || (isCredit && doc.seller?.countryCode === "IN" && Boolean(doc.seller?.taxId));

  // Accent rule, then seller (left) and title block (right).
  w.page.drawRectangle({ x: MARGIN, y: w.y - 3, width: 56, height: 3, color: ACCENT });
  w.y -= 16;
  const top = w.y;
  const rightW = 200;
  const leftW = CONTENT_W - rightW - 24;
  const sellerH = drawParty(w, "From", doc.seller, MARGIN, top, leftW);
  let ry = top;
  for (const l of w.wrap(title, st.title, rightW)) {
    w.line(l, st.title, MARGIN + CONTENT_W - rightW, ry, { width: rightW, align: "right" });
    ry -= 24;
  }
  w.line(doc.code ?? "Number given when issued", st.number, MARGIN + CONTENT_W - rightW, ry, { width: rightW, align: "right" });
  ry -= 16;
  w.line(`Status: ${STATUS_LABELS[doc.status] ?? doc.status}`, st.small, MARGIN + CONTENT_W - rightW, ry, { width: rightW, align: "right" });
  ry -= 12;
  w.y = top - Math.max(sellerH, top - ry) - 10;
  w.rule(w.y);
  w.y -= 14;

  // Buyer (left) and document details (right).
  const servicePeriod =
    doc.servicePeriodStart && doc.servicePeriodEnd ? `${date(doc.servicePeriodStart)} - ${date(new Date(doc.servicePeriodEnd.getTime() - 1))}` : null;
  const meta: [string, string | null][] = [
    [isCredit ? "Credit note date" : "Invoice date", date(doc.issuedAt)],
    ...(!isCredit ? ([["Due date", doc.status !== "draft" ? date(doc.dueAt) : null]] as [string, string | null][]) : []),
    ["Place of supply", placeOfSupplyLabel(doc.placeOfSupply)],
    ["Currency", doc.currency],
    ["Service period", servicePeriod],
    ["Purchase order", doc.purchaseOrderReference],
    ["Against invoice", doc.originalInvoice ? (doc.originalInvoice.code ?? doc.originalInvoice.id) : null],
    ...(gstInvoice ? ([["Reverse charge", doc.taxTreatment === "reverse_charge" ? "Yes" : "No"]] as [string, string | null][]) : []),
  ];
  const detailsTop = w.y;
  const buyerH = drawParty(w, isCredit ? "Credited to" : "Bill to", doc.buyer, MARGIN, detailsTop, leftW);
  let my = detailsTop;
  const metaX = MARGIN + CONTENT_W - rightW;
  for (const [label, value] of meta) {
    if (!value) continue;
    // Baseline of the 7.5pt label level with the 9pt value.
    w.line(label, st.small, metaX, my - 1.5);
    for (const l of w.wrap(value, st.bodyBold, rightW - 90)) {
      w.line(l, st.bodyBold, metaX + 90, my - 0.5, { width: rightW - 90, align: "right" });
      my -= 12;
    }
    my -= 2;
  }
  w.y = detailsTop - Math.max(buyerH, detailsTop - my) - 12;

  // Lines.
  const columns: Column[] = [
    { key: "n", header: "#", width: 18, align: "left" },
    { key: "desc", header: "Description", width: 0, align: "left" },
    { key: "sac", header: "HSN/SAC", width: 44, align: "left" },
    { key: "qty", header: "Qty", width: 26, align: "right" },
    { key: "taxable", header: "Taxable value", width: 78, align: "right" },
    { key: "tax", header: "Tax", width: 84, align: "right" },
    { key: "amount", header: "Amount", width: 80, align: "right" },
  ];
  const GAP = 6;
  const fixed = columns.reduce((a, c) => a + c.width, 0);
  columns[1]!.width = CONTENT_W - fixed - GAP * (columns.length - 1);
  const colX = (index: number) => MARGIN + columns.slice(0, index).reduce((a, c) => a + c.width + GAP, 0);

  const drawHeader = () => {
    w.ensure(22);
    columns.forEach((c, i) => w.line(c.header, st.label, colX(i), w.y, { width: c.width, align: c.align }));
    w.y -= 13;
    w.rule(w.y, INK, 0.75);
    w.y -= 6;
  };
  drawHeader();
  if (!doc.lines.length) {
    w.line("No items yet.", st.small, MARGIN, w.y);
    w.y -= 16;
  }
  doc.lines.forEach((line, index) => {
    const descLines = w.wrap(line.description, st.body, columns[1]!.width);
    const extra: string[] = [];
    if (line.quantity > 1 || line.discountMinor > 0) {
      extra.push(`${line.quantity} x ${money(line.unitAmountMinor)}${line.discountMinor > 0 ? `, discount ${money(line.discountMinor)}` : ""}`);
    }
    const extraLines = extra.flatMap((e) => w.wrap(e, st.small, columns[1]!.width));
    const taxNames = line.taxes.length ? line.taxes.map((t) => `${t.name.replace(/\s*\d+(\.\d+)?%$/, "")} ${formatRate(t.rateBasisPoints)}`).join(" + ") : null;
    const taxNameLines = taxNames ? w.wrap(taxNames, st.small, columns[5]!.width) : [];
    const height = Math.max(descLines.length * 11 + extraLines.length * 10, 11 + taxNameLines.length * 10) + 8;
    if (w.ensure(height)) drawHeader();
    const rowTop = w.y;
    w.line(String(index + 1), st.body, colX(0), rowTop, { width: columns[0]!.width });
    let dy = rowTop;
    for (const l of descLines) {
      w.line(l, st.body, colX(1), dy);
      dy -= 11;
    }
    for (const l of extraLines) {
      w.line(l, st.small, colX(1), dy);
      dy -= 10;
    }
    w.line(line.taxCode ?? "-", st.body, colX(2), rowTop);
    w.line(String(line.quantity), st.body, colX(3), rowTop, { width: columns[3]!.width, align: "right" });
    w.line(money(line.amountMinor), st.body, colX(4), rowTop, { width: columns[4]!.width, align: "right" });
    if (line.taxes.length) {
      w.line(money(line.taxMinor), st.body, colX(5), rowTop, { width: columns[5]!.width, align: "right" });
      let ty = rowTop - 11;
      for (const l of taxNameLines) {
        w.line(l, st.small, colX(5), ty, { width: columns[5]!.width, align: "right" });
        ty -= 10;
      }
    } else {
      w.line("-", st.body, colX(5), rowTop, { width: columns[5]!.width, align: "right" });
    }
    w.line(money(line.amountMinor + line.taxMinor), st.bodyBold, colX(6), rowTop, { width: columns[6]!.width, align: "right" });
    w.y = rowTop - height;
    w.rule(w.y + 3);
  });
  w.y -= 10;

  // Totals (right) with the tax note (left).
  const totals: { label: string; value: string; strong?: boolean }[] = [{ label: "Subtotal", value: money(doc.subtotalMinor) }];
  if (doc.discountMinor) totals.push({ label: "Discount", value: `-${money(doc.discountMinor)}` });
  totals.push({ label: "Taxable value", value: money(doc.subtotalMinor - doc.discountMinor) });
  for (const t of doc.taxSummary) totals.push({ label: t.name, value: money(t.amountMinor) });
  totals.push({ label: "Tax", value: money(doc.taxMinor) });
  totals.push({ label: isCredit ? "Total credited" : "Total", value: money(doc.totalMinor), strong: true });
  if (!isCredit && doc.status !== "draft") {
    totals.push({ label: "Paid", value: money(doc.amountPaidMinor) });
    if (doc.amountRefundedMinor) totals.push({ label: "Refunded", value: money(doc.amountRefundedMinor) });
    totals.push({ label: "Balance due", value: money(doc.outstandingMinor), strong: true });
  }
  const taxNote =
    doc.taxTreatment === "out_of_scope"
      ? doc.seller?.countryCode === "IN" && !doc.seller?.taxId
        ? "Supplier not registered under GST - no GST charged."
        : "No tax charged."
      : (TREATMENT_NOTES[doc.taxTreatment] ?? null);
  const leftNotes = [taxNote, doc.couponCode ? `Coupon applied: ${doc.couponCode}` : null].filter((v): v is string => Boolean(v));
  const totalsW = 230;
  const totalsX = MARGIN + CONTENT_W - totalsW;
  const totalsH = totals.reduce((a, t) => a + (t.strong ? 18 : 13), 0) + 8;
  w.ensure(totalsH);
  const totalsTop = w.y;
  let ny = totalsTop;
  for (const note of leftNotes) {
    for (const l of w.wrap(note, st.small, CONTENT_W - totalsW - 24)) {
      w.line(l, st.small, MARGIN, ny);
      ny -= 10;
    }
    ny -= 4;
  }
  let ty = totalsTop;
  for (const t of totals) {
    if (t.strong) {
      w.rule(ty + 2, LINE, 0.75, totalsX, totalsW);
      ty -= 4;
    }
    const style = t.strong ? st.total : st.body;
    w.line(t.label, t.strong ? style : { ...style, color: MUTED }, totalsX, ty);
    w.line(t.value, style, totalsX, ty, { width: totalsW, align: "right" });
    ty -= t.strong ? 16 : 13;
  }
  w.y = Math.min(ty, ny) - 10;

  const paragraph = (heading: string | null, text: string) => {
    const lines = w.wrap(text, st.body, CONTENT_W);
    w.ensure((heading ? 14 : 0) + Math.min(lines.length, 3) * 12);
    if (heading) {
      w.line(heading.toUpperCase(), st.label, MARGIN, w.y);
      w.y -= 13;
    }
    for (const l of lines) {
      w.ensure(12);
      w.line(l, st.body, MARGIN, w.y);
      w.y -= 12;
    }
    w.y -= 8;
  };

  if (doc.status === "void") {
    paragraph(null, `This invoice was voided${doc.voidedAt ? ` on ${date(doc.voidedAt)}` : ""}${doc.voidReason ? `: ${doc.voidReason}` : "."} Nothing is payable on it.`);
  }
  if (doc.payments.length) {
    paragraph("Payments received", doc.payments.map((p) => `${p.code}${p.receivedAt ? ` (${date(p.receivedAt)})` : ""}: ${money(p.amountMinor)}`).join("\n"));
  }
  if (doc.creditNotes.length) {
    paragraph("Credit notes", doc.creditNotes.map((n) => `${n.code ?? n.id}${n.issuedAt ? ` (${date(n.issuedAt)})` : ""}: ${money(n.totalMinor)}`).join("\n"));
  }
  if (!isCredit && doc.outstandingMinor > 0 && opts.paymentInstructions) {
    paragraph("How to pay", `${opts.paymentInstructions}\nPlease quote the invoice number ${doc.code ?? ""} with your payment.`);
  }
  if (doc.notes) paragraph("Notes", doc.notes);
  if (opts.footerNote) paragraph(null, opts.footerNote);

  // Footer on every page.
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    page.drawRectangle({ x: MARGIN, y: MARGIN + 14, width: CONTENT_W, height: 0.75, color: LINE });
    const left = w.clean("This is a computer-generated document.");
    page.drawText(left, { x: MARGIN, y: MARGIN, size: 7.5, font: regular, color: MUTED });
    const right = w.clean(`${doc.code ?? title} - page ${i + 1} of ${total}`);
    page.drawText(right, { x: MARGIN + CONTENT_W - regular.widthOfTextAtSize(right, 7.5), y: MARGIN, size: 7.5, font: regular, color: MUTED });
  });

  return pdf.save();
}
