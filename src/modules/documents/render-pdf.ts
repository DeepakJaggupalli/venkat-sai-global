/**
 * Certificates (A4 landscape, framed) and letters (A4 portrait, letterhead) as PDF with pdf-lib and the standard
 * Times fonts. Every page carries the reference number, the verification code and a QR code that opens the public
 * check page. Documents that are not approved yet carry a large "DRAFT" watermark so a preview is never mistaken for
 * the real thing. Strings go through the WinAnsi sanitiser, so names in other scripts never make generation fail
 * (staff are asked to type names in English letters).
 */
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { toBuffer } from "qrcode";

import { BRAND } from "@/config/site";
import { makeWinAnsiSanitizer } from "@/modules/resume-service/render/pdf";

import { isCertificateKind, printDate, type DocumentContent, type IssuedDocumentKind } from "./content";

const INK = rgb(0.04, 0.04, 0.045);
const ACCENT = rgb(0.012, 0.412, 0.631); // #0369a1
const ACCENT_SOFT = rgb(0.878, 0.949, 0.996); // #e0f2fe
const GREY = rgb(0.36, 0.36, 0.4);
const WATERMARK = rgb(0.85, 0.85, 0.87);

export type RenderDocumentInput = {
  kind: IssuedDocumentKind;
  code: string;
  content: DocumentContent;
  /** Printed "XXXX-XXXX-XXXX". */
  verificationCodeDisplay: string;
  verifyUrl: string;
  /** Printed when content.issueDate is blank (approval date, or today for a draft). */
  fallbackIssueDate: string;
  draft: boolean;
  signature?: { bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null;
  address?: string;
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont; sans: PDFFont; sansBold: PDFFont };

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let lineText = "";
    for (const word of words) {
      const next = lineText ? `${lineText} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        lineText = next;
        continue;
      }
      if (lineText) out.push(lineText);
      // A single word wider than the line is cut so it never overflows the frame.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      lineText = rest;
    }
    if (lineText) out.push(lineText);
  }
  return out;
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK, centerX = page.getWidth() / 2): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

function spaced(text: string): string {
  return text.toUpperCase().split("").join(" ");
}

function fitSize(text: string, font: PDFFont, size: number, maxWidth: number, min: number): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

function drawWatermark(page: PDFPage, font: PDFFont): void {
  const text = "DRAFT - NOT APPROVED";
  const size = page.getWidth() > page.getHeight() ? 70 : 56;
  const w = font.widthOfTextAtSize(text, size);
  const cx = page.getWidth() / 2;
  const cy = page.getHeight() / 2;
  const a = (28 * Math.PI) / 180;
  page.drawText(text, { x: cx - (w / 2) * Math.cos(a), y: cy - (w / 2) * Math.sin(a), size, font, color: WATERMARK, rotate: degrees(28), opacity: 0.6 });
}

async function embedQr(doc: PDFDocument, url: string): Promise<PDFImage> {
  const png = await toBuffer(url, { margin: 1, width: 300, errorCorrectionLevel: "M", color: { dark: "#0a0a0bff", light: "#ffffffff" } });
  return doc.embedPng(png);
}

async function embedSignature(doc: PDFDocument, sig: RenderDocumentInput["signature"]): Promise<PDFImage | null> {
  if (!sig) return null;
  try {
    return sig.type === "image/png" ? await doc.embedPng(sig.bytes) : await doc.embedJpg(sig.bytes);
  } catch {
    return null; // A damaged image never blocks the document; the signature line stays blank.
  }
}

function signatureBlock(page: PDFPage, f: Fonts, clean: (s: string) => string, c: DocumentContent, sig: PDFImage | null, right: number, baseY: number, align: "center" | "left"): void {
  const width = 200;
  const left = align === "center" ? right - width : right;
  const mid = left + width / 2;
  if (sig) {
    const scale = Math.min(150 / sig.width, 48 / sig.height, 1);
    const w = sig.width * scale;
    const h = sig.height * scale;
    page.drawImage(sig, { x: align === "center" ? mid - w / 2 : left, y: baseY + 4, width: w, height: h });
  }
  page.drawLine({ start: { x: left, y: baseY }, end: { x: left + width, y: baseY }, thickness: 0.8, color: INK });
  const linesOut = [
    { text: clean(c.signatoryName ?? ""), font: f.bold, size: 11.5 },
    { text: clean(c.signatoryTitle), font: f.regular, size: 10.5 },
    { text: clean(c.organisation), font: f.regular, size: 9.5 },
  ].filter((l) => l.text);
  let y = baseY - 14;
  for (const l of linesOut) {
    const size = fitSize(l.text, l.font, l.size, width + 40, 7);
    if (align === "center") centered(page, l.text, y, l.font, size, INK, mid);
    else page.drawText(l.text, { x: left, y, size, font: l.font, color: INK });
    y -= size + 3;
  }
}

async function renderCertificate(doc: PDFDocument, f: Fonts, input: RenderDocumentInput): Promise<void> {
  const clean = makeWinAnsiSanitizer(f.regular);
  const c = input.content;
  const W = 841.89;
  const H = 595.28;
  const page = doc.addPage([W, H]);

  // Frame: soft band, strong outer border, thin accent inner border.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  for (const [x, y] of [
    [26, H - 26 - 46],
    [W - 26 - 46, H - 26 - 46],
    [26, 26],
    [W - 26 - 46, 26],
  ] as const) {
    page.drawRectangle({ x, y, width: 46, height: 46, color: ACCENT_SOFT });
  }
  page.drawRectangle({ x: 16, y: 16, width: W - 32, height: H - 32, borderColor: INK, borderWidth: 3 });
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: ACCENT, borderWidth: 1 });
  if (input.draft) drawWatermark(page, f.sansBold);

  let y = H - 78;
  centered(page, spaced(BRAND.name), y, f.sansBold, 12, ACCENT);
  y -= 16;
  centered(page, clean(c.organisation === BRAND.legalEntity ? `${BRAND.legalEntity}, ${input.address ?? BRAND.headquarters}` : c.organisation), y, f.sans, 9, GREY);

  y -= 52;
  const title = clean(c.title.toUpperCase());
  centered(page, title, y, f.bold, fitSize(title, f.bold, 34, W - 160, 18));
  y -= 14;
  page.drawLine({ start: { x: W / 2 - 60, y }, end: { x: W / 2 + 60, y }, thickness: 2, color: ACCENT });

  y -= 34;
  centered(page, "This is to certify that", y, f.italic, 14, GREY);
  y -= 42;
  const name = clean(c.holderName);
  const nameSize = fitSize(name, f.boldItalic, 32, W - 200, 18);
  centered(page, name, y, f.boldItalic, nameSize);
  y -= 12;
  page.drawLine({ start: { x: W / 2 - 220, y }, end: { x: W / 2 + 220, y }, thickness: 0.6, color: GREY });

  y -= 26;
  const bodyLines = wrap(clean(c.body.replace(/\n{2,}/g, "\n")), f.regular, 13, W - 220).slice(0, 7);
  for (const l of bodyLines) {
    centered(page, l, y, f.regular, 13);
    y -= 18;
  }
  if (c.result) {
    y -= 4;
    centered(page, clean(`Result: ${c.result}`), y, f.bold, 12);
  }

  // Footer: date, place and number (left), QR (centre), signature (right).
  const footY = 92;
  const issue = printDate(c.issueDate || input.fallbackIssueDate);
  const left = 70;
  page.drawText(clean(`Date: ${issue}`), { x: left, y: footY + 26, size: 11, font: f.regular, color: INK });
  page.drawText(clean(`Place: ${c.place}`), { x: left, y: footY + 10, size: 11, font: f.regular, color: INK });
  page.drawText(clean(`Certificate No: ${input.code}`), { x: left, y: footY - 6, size: 10, font: f.regular, color: GREY });

  const qr = await embedQr(doc, input.verifyUrl);
  const qrSize = 66;
  page.drawImage(qr, { x: W / 2 - qrSize / 2, y: footY - 10, width: qrSize, height: qrSize });
  centered(page, clean(`Verify: ${input.verificationCodeDisplay}`), footY - 24, f.sans, 8, GREY);

  signatureBlock(page, f, clean, c, await embedSignature(doc, input.signature), W - 70, footY + 22, "center");
  centered(page, clean(`Check this certificate at ${input.verifyUrl}`), 36, f.sans, 7.5, GREY);
}

async function renderLetter(doc: PDFDocument, f: Fonts, input: RenderDocumentInput): Promise<void> {
  const clean = makeWinAnsiSanitizer(f.regular);
  const c = input.content;
  const W = 595.28;
  const H = 841.89;
  const X = 64;
  const CW = W - 2 * X;
  const BODY = 11.5;
  const LEAD = 17;
  const BOTTOM = 120;
  const qr = await embedQr(doc, input.verifyUrl);
  const sig = await embedSignature(doc, input.signature);
  const pages: PDFPage[] = [];

  const newPage = (): { page: PDFPage; y: number } => {
    const page = doc.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: ACCENT });
    if (input.draft) drawWatermark(page, f.sansBold);
    page.drawText(spaced(BRAND.name), { x: X, y: H - 52, size: 15, font: f.sansBold, color: INK });
    page.drawText(clean(BRAND.legalEntity), { x: X, y: H - 68, size: 9.5, font: f.sans, color: GREY });
    const addr = clean(input.address ?? BRAND.headquarters);
    const addrLines = wrap(addr, f.sans, 8.5, 210);
    let ay = H - 50;
    for (const l of addrLines) {
      page.drawText(l, { x: W - X - f.sans.widthOfTextAtSize(l, 8.5), y: ay, size: 8.5, font: f.sans, color: GREY });
      ay -= 11;
    }
    page.drawLine({ start: { x: X, y: H - 82 }, end: { x: W - X, y: H - 82 }, thickness: 1.5, color: ACCENT });
    return { page, y: H - 110 };
  };

  let { page, y } = newPage();
  page.drawText(clean(`Ref: ${input.code}`), { x: X, y, size: 10.5, font: f.regular, color: INK });
  const dateText = clean(`Date: ${printDate(c.issueDate || input.fallbackIssueDate)}`);
  page.drawText(dateText, { x: W - X - f.regular.widthOfTextAtSize(dateText, 10.5), y, size: 10.5, font: f.regular, color: INK });

  y -= 40;
  const title = clean(c.title.toUpperCase());
  const titleSize = fitSize(title, f.bold, 15, CW, 10);
  centered(page, title, y, f.bold, titleSize);
  const tw = f.bold.widthOfTextAtSize(title, titleSize);
  page.drawLine({ start: { x: W / 2 - tw / 2, y: y - 4 }, end: { x: W / 2 + tw / 2, y: y - 4 }, thickness: 0.8, color: INK });
  y -= 34;

  const paragraphs = clean(c.body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const para of paragraphs) {
    for (const l of wrap(para, f.regular, BODY, CW)) {
      if (y < BOTTOM) ({ page, y } = newPage());
      page.drawText(l, { x: X, y, size: BODY, font: f.regular, color: INK });
      y -= LEAD;
    }
    y -= 8;
  }

  // Signature block (moves to a new page when the body filled this one).
  if (y < BOTTOM + 110) ({ page, y } = newPage());
  y -= 6;
  page.drawText("Yours sincerely,", { x: X, y, size: BODY, font: f.regular, color: INK });
  signatureBlock(page, f, clean, c, sig, X, y - 64, "left");
  page.drawText(clean(`Place: ${c.place}`), { x: W - X - 150, y: y - 64, size: 10.5, font: f.regular, color: INK });

  // Footer on every page: QR + how to check.
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: X, y: 84 }, end: { x: W - X, y: 84 }, thickness: 0.5, color: GREY });
    p.drawImage(qr, { x: X, y: 28, width: 48, height: 48 });
    p.drawText(clean(`Check this letter: ${input.verifyUrl}`), { x: X + 58, y: 60, size: 8, font: f.sans, color: GREY });
    p.drawText(clean(`Verification code ${input.verificationCodeDisplay} · Ref ${input.code}`), { x: X + 58, y: 48, size: 8, font: f.sans, color: GREY });
    if (pages.length > 1) p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - X - 50, y: 48, size: 8, font: f.sans, color: GREY });
  });
}

export async function renderDocumentPdf(input: RenderDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.content.title} - ${input.content.holderName}`);
  doc.setAuthor(BRAND.legalEntity);
  doc.setSubject(`${input.code} (verification code ${input.verificationCodeDisplay})`);
  doc.setCreator(BRAND.name);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  if (isCertificateKind(input.kind)) await renderCertificate(doc, fonts, input);
  else await renderLetter(doc, fonts, input);
  return doc.save();
}
