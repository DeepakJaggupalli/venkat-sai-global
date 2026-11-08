import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import { logger } from "@/lib/logger";
import { openFileContent, type FileRow } from "@/modules/files";

/**
 * Merge a candidate's documents into one A4 PDF (CV pack / visa pack): PDFs are appended page by page, images become
 * one page each (scaled down with sharp first so memory stays small), Word files cannot be merged and get a note page.
 * Callers decide the order and authorise every file before passing it in.
 */

export type PackItem = { kind: "file"; label: string; file: FileRow } | { kind: "note"; label: string; text: string };

export type PackResult = { bytes: Uint8Array; pageCount: number; included: string[]; skipped: { label: string; reason: string }[] };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 28;
/** Long side in pixels for embedded images (about 200 dpi on A4). */
const IMAGE_MAX = { width: 1654, height: 2339 };
const WORD_TYPES = new Set(["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

async function readAll(file: FileRow): Promise<Uint8Array | null> {
  const content = await openFileContent(file, null);
  if (!content) return null;
  const reader = content.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function winAnsi(text: string, font: PDFFont): string {
  const allowed = new Set(font.getCharacterSet());
  return Array.from(text.normalize("NFKD").replace(/[̀-ͯ]/g, ""))
    .map((ch) => (allowed.has(ch.codePointAt(0) ?? 0) ? ch : "?"))
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function notePage(doc: PDFDocument, fonts: { regular: PDFFont; bold: PDFFont }, title: string, body: string): PDFPage {
  const page = doc.addPage(A4);
  let y = A4[1] - 96;
  for (const line of wrap(winAnsi(title, fonts.bold), fonts.bold, 18, A4[0] - 2 * 72)) {
    page.drawText(line, { x: 72, y, size: 18, font: fonts.bold, color: rgb(0, 0, 0) });
    y -= 26;
  }
  y -= 10;
  for (const line of wrap(winAnsi(body, fonts.regular), fonts.regular, 12, A4[0] - 2 * 72)) {
    page.drawText(line, { x: 72, y, size: 12, font: fonts.regular, color: rgb(0, 0, 0) });
    y -= 18;
  }
  return page;
}

async function addImagePage(doc: PDFDocument, bytes: Uint8Array): Promise<void> {
  const jpeg = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ ...IMAGE_MAX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  const image = await doc.embedJpg(jpeg);
  const page = doc.addPage(A4);
  const maxW = A4[0] - 2 * MARGIN;
  const maxH = A4[1] - 2 * MARGIN;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1.5);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
}

/** Build the pack. Items are added in the order given. */
export async function buildDocumentPack(input: { title: string; author?: string; items: readonly PackItem[] }): Promise<PackResult> {
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setAuthor(input.author ?? "Venkat Sai Global");
  doc.setProducer("Venkat Sai Global");
  doc.setCreator("Venkat Sai Global");
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const included: string[] = [];
  const skipped: { label: string; reason: string }[] = [];

  for (const item of input.items) {
    if (item.kind === "note") {
      notePage(doc, fonts, item.label, item.text);
      continue;
    }
    const { file, label } = item;
    if (WORD_TYPES.has(file.mimeType)) {
      notePage(doc, fonts, label, `This document is a Word file (${file.originalName}) and cannot be merged into the PDF. It is attached separately: download it from the Command Centre.`);
      skipped.push({ label, reason: "word" });
      continue;
    }
    try {
      const bytes = await readAll(file);
      if (!bytes) {
        skipped.push({ label, reason: "missing" });
        notePage(doc, fonts, label, `${file.originalName} could not be read from storage.`);
        continue;
      }
      if (file.mimeType === "application/pdf") {
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        const pages = await doc.copyPages(source, source.getPageIndices());
        for (const p of pages) doc.addPage(p);
      } else if (file.mimeType.startsWith("image/")) {
        await addImagePage(doc, bytes);
      } else {
        skipped.push({ label, reason: "type" });
        continue;
      }
      included.push(label);
    } catch (error) {
      logger.warn("Document pack: file could not be merged", { fileId: file.id, error });
      skipped.push({ label, reason: "unreadable" });
      notePage(doc, fonts, label, `${file.originalName} could not be merged (the file may be damaged or password protected). Download it separately from the Command Centre.`);
    }
  }

  if (doc.getPageCount() === 0) notePage(doc, fonts, input.title, "There are no documents to include yet.");
  const bytes = await doc.save();
  return { bytes, pageCount: doc.getPageCount(), included, skipped };
}

/** A safe PDF download response (private, never cached). */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
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
