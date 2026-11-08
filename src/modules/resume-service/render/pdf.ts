/**
 * Resume as PDF (pdf-lib, standard Times fonts) in the same layout as the Word version: "RESUME" title,
 * passport photo box at the top right, LABEL : value block, passport table, experience tables with header rows
 * repeated after a page break, and an optional declaration. A4, plain black on white.
 *
 * The standard fonts only encode WinAnsi: every string is sanitised (accents folded, anything else "?") so
 * names in other scripts never make generation fail.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import type { ResumeDetails } from "../schemas";
import { buildResumeModel, type ResumeModel } from "./model";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56.69; // 2 cm
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const BLACK = rgb(0, 0, 0);

const BODY = 11;
const BODY_LEADING = 14;
const TABLE = 10.5;
const TABLE_LEADING = 13;
const CELL_PAD = 4;
const LINE_W = 0.75;

const PHOTO_W = 99.21; // 3.5 cm
const PHOTO_H = 127.56; // 4.5 cm

type Align = "left" | "center";
type HeaderCell = { text: string; col: number; row: number; colSpan?: number; rowSpan?: number };
type TableSpec = {
  widths: number[];
  headerRows: number;
  header: HeaderCell[];
  rows: string[][];
  align: Align[];
  minRowHeight: number;
};

/** Keeps characters the font can encode; folds accents (NFKD) for the rest; "?" when nothing fits. */
export function makeWinAnsiSanitizer(font: PDFFont): (input: string) => string {
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

class Writer {
  page!: PDFPage;
  y = 0;
  readonly clean: (s: string) => string;

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.clean = makeWinAnsiSanitizer(regular);
    this.addPage();
  }

  addPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_TOP;
  }

  /** Starts a new page when `height` does not fit; true when it did. */
  ensure(height: number): boolean {
    if (this.y - height >= MARGIN_BOTTOM) return false;
    this.addPage();
    return true;
  }

  width(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const paragraph of this.clean(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.width(candidate, font, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        if (this.width(word, font, size) <= width) {
          line = word;
          continue;
        }
        // A single word wider than the column: break it by characters.
        let chunk = "";
        for (const ch of word) {
          if (chunk && this.width(chunk + ch, font, size) > width) {
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

  /** Draws one already-sanitised line with its top at `top`. */
  line(text: string, x: number, top: number, font: PDFFont, size: number, opts: { underline?: boolean } = {}): void {
    if (!text) return;
    const baseline = top - size * 0.8;
    this.page.drawText(text, { x, y: baseline, size, font, color: BLACK });
    if (opts.underline) {
      const w = this.width(text, font, size);
      this.page.drawLine({ start: { x, y: baseline - 1.6 }, end: { x: x + w, y: baseline - 1.6 }, thickness: 0.8, color: BLACK });
    }
  }

  box(x: number, top: number, width: number, height: number): void {
    this.page.drawRectangle({ x, y: top - height, width, height, borderColor: BLACK, borderWidth: LINE_W });
  }
}

function drawTitle(w: Writer, model: ResumeModel): void {
  const size = 20;
  const text = w.clean(model.title);
  const x = (PAGE_W - w.width(text, w.bold, size)) / 2;
  w.line(text, x, w.y, w.bold, size, { underline: true });
  w.y -= size + 14;
}

function drawDetails(w: Writer, model: ResumeModel, photo: PDFImage | null): void {
  const labelW = 180;
  const colonX = MARGIN_X + labelW;
  const valueX = colonX + 12;
  const photoX = PAGE_W - MARGIN_X - PHOTO_W;
  const photoPage = w.page;
  const photoTop = w.y;
  const photoBottom = photoTop - PHOTO_H;

  w.box(photoX, photoTop, PHOTO_W, PHOTO_H);
  if (photo) {
    const scale = Math.min((PHOTO_W - 4) / photo.width, (PHOTO_H - 4) / photo.height);
    const iw = photo.width * scale;
    const ih = photo.height * scale;
    w.page.drawImage(photo, { x: photoX + (PHOTO_W - iw) / 2, y: photoBottom + (PHOTO_H - ih) / 2, width: iw, height: ih });
  }

  const gap = model.blank ? 6 : 4;
  for (const row of model.rows) {
    const besidePhoto = w.page === photoPage && w.y > photoBottom + 2;
    const right = besidePhoto ? photoX - 12 : PAGE_W - MARGIN_X;
    const labels = w.wrap(row.label, w.bold, BODY, labelW - 6);
    const values = w.wrap(row.value, w.regular, BODY, right - valueX);
    const height = Math.max(labels.length, values.length) * BODY_LEADING + gap;
    w.ensure(height);
    labels.forEach((l, i) => w.line(l, MARGIN_X, w.y - i * BODY_LEADING, w.bold, BODY));
    w.line(":", colonX, w.y, w.bold, BODY);
    values.forEach((v, i) => w.line(v, valueX, w.y - i * BODY_LEADING, w.regular, BODY));
    w.y -= height;
  }
  if (w.page === photoPage && w.y > photoBottom - 8) w.y = photoBottom - 8;
}

function headingHeight(): number {
  return 12 + 10;
}

function drawHeading(w: Writer, title: string, total?: string): void {
  const size = 12;
  const t = w.clean(title);
  w.line(t, MARGIN_X, w.y, w.bold, size, { underline: true });
  if (total) w.line(w.clean(total), MARGIN_X + w.width(t, w.bold, size) + 8, w.y, w.bold, size);
  w.y -= headingHeight();
}

function headerLayout(w: Writer, spec: TableSpec): number[] {
  const heights = Array.from({ length: spec.headerRows }, () => 16);
  const span = (c: HeaderCell) => spec.widths.slice(c.col, c.col + (c.colSpan ?? 1)).reduce((a, b) => a + b, 0);
  const need = (c: HeaderCell) => w.wrap(c.text, w.bold, TABLE, span(c) - 2 * CELL_PAD).length * TABLE_LEADING + 2 * CELL_PAD;
  for (const c of spec.header) if ((c.rowSpan ?? 1) === 1) heights[c.row] = Math.max(heights[c.row]!, need(c));
  for (const c of spec.header) {
    const rs = c.rowSpan ?? 1;
    if (rs === 1) continue;
    const have = heights.slice(c.row, c.row + rs).reduce((a, b) => a + b, 0);
    const missing = need(c) - have;
    if (missing > 0) heights[c.row + rs - 1]! += missing;
  }
  return heights;
}

function drawHeader(w: Writer, spec: TableSpec, heights: number[]): void {
  const colX = (col: number) => MARGIN_X + spec.widths.slice(0, col).reduce((a, b) => a + b, 0);
  for (const c of spec.header) {
    const x = colX(c.col);
    const width = spec.widths.slice(c.col, c.col + (c.colSpan ?? 1)).reduce((a, b) => a + b, 0);
    const top = w.y - heights.slice(0, c.row).reduce((a, b) => a + b, 0);
    const height = heights.slice(c.row, c.row + (c.rowSpan ?? 1)).reduce((a, b) => a + b, 0);
    w.box(x, top, width, height);
    const lines = w.wrap(c.text, w.bold, TABLE, width - 2 * CELL_PAD);
    const textTop = top - (height - lines.length * TABLE_LEADING) / 2 - 1;
    lines.forEach((l, i) => w.line(l, x + (width - w.width(l, w.bold, TABLE)) / 2, textTop - i * TABLE_LEADING, w.bold, TABLE));
  }
  w.y -= heights.reduce((a, b) => a + b, 0);
}

function rowLayout(w: Writer, spec: TableSpec, cells: string[]): { lines: string[][]; height: number } {
  const lines = cells.map((text, i) => w.wrap(text, w.regular, TABLE, spec.widths[i]! - 2 * CELL_PAD));
  const height = Math.max(spec.minRowHeight, Math.max(...lines.map((l) => l.length)) * TABLE_LEADING + 2 * CELL_PAD);
  return { lines, height };
}

/** Draws a bordered table; the heading (if any) is kept on the same page as the header and first row. */
function drawTable(w: Writer, spec: TableSpec, heading?: { title: string; total?: string }): void {
  const heights = headerLayout(w, spec);
  const headerH = heights.reduce((a, b) => a + b, 0);
  const first = spec.rows[0] ? rowLayout(w, spec, spec.rows[0]).height : 0;
  w.ensure((heading ? headingHeight() : 0) + headerH + first);
  if (heading) drawHeading(w, heading.title, heading.total);
  drawHeader(w, spec, heights);
  for (const cells of spec.rows) {
    const { lines, height } = rowLayout(w, spec, cells);
    if (w.ensure(height)) drawHeader(w, spec, heights);
    let x = MARGIN_X;
    lines.forEach((cellLines, i) => {
      const width = spec.widths[i]!;
      w.box(x, w.y, width, height);
      const textTop = w.y - (height - cellLines.length * TABLE_LEADING) / 2 - 1;
      cellLines.forEach((l, j) => {
        const lx = spec.align[i] === "center" ? x + (width - w.width(l, w.regular, TABLE)) / 2 : x + CELL_PAD;
        w.line(l, lx, textTop - j * TABLE_LEADING, w.regular, TABLE);
      });
      x += width;
    });
    w.y -= height;
  }
}

function drawDeclaration(w: Writer, model: ResumeModel): void {
  const d = model.declaration;
  if (!d) return;
  const text = w.wrap(d.text, w.regular, BODY, CONTENT_W);
  const lines = d.name ? 3 : 2;
  w.y -= 10;
  w.ensure(headingHeight() + text.length * BODY_LEADING + 20 + lines * 18);
  drawHeading(w, d.heading);
  text.forEach((l, i) => w.line(l, MARGIN_X, w.y - i * BODY_LEADING, w.regular, BODY));
  w.y -= text.length * BODY_LEADING + 20;
  const right = (s: string, font: PDFFont) => {
    const t = w.clean(s);
    w.line(t, PAGE_W - MARGIN_X - w.width(t, font, BODY), w.y, font, BODY);
  };
  w.line(w.clean(`Place : ${d.place}`), MARGIN_X, w.y, w.regular, BODY);
  w.y -= 18;
  w.line("Date : ", MARGIN_X, w.y, w.regular, BODY);
  right("(SIGNATURE)", w.bold);
  w.y -= 18;
  if (d.name) {
    right(d.name.toUpperCase(), w.regular);
    w.y -= 18;
  }
}

export async function renderResumePdf(details: ResumeDetails | null, opts: { photoJpeg?: Uint8Array | null; today?: Date } = {}): Promise<Uint8Array> {
  const model = buildResumeModel(details, { today: opts.today });
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const w = new Writer(doc, regular, bold);

  let photo: PDFImage | null = null;
  if (opts.photoJpeg?.byteLength) {
    try {
      photo = await doc.embedJpg(opts.photoJpeg);
    } catch {
      photo = null; // unreadable image: keep the empty box rather than failing the whole resume
    }
  }

  drawTitle(w, model);
  drawDetails(w, model, photo);

  w.y -= 8;
  const pw = CONTENT_W / 4;
  drawTable(
    w,
    {
      widths: [pw, pw, pw, pw],
      headerRows: 1,
      header: model.passportHeaders.map((text, col) => ({ text, col, row: 0 })),
      rows: [model.passportValues],
      align: ["center", "center", "center", "center"],
      minRowHeight: 20,
    },
    { title: model.passportTitle },
  );

  const h = model.experienceHeaders;
  const widths = [40, 190, 70, 70, CONTENT_W - 40 - 190 - 70 - 70];
  for (const section of model.experience) {
    w.y -= 10;
    drawTable(
      w,
      {
        widths,
        headerRows: 2,
        header: [
          { text: h.sl, col: 0, row: 0, rowSpan: 2 },
          { text: h.organisation, col: 1, row: 0, rowSpan: 2 },
          { text: h.period, col: 2, row: 0, colSpan: 2 },
          { text: h.designation, col: 4, row: 0, rowSpan: 2 },
          { text: h.from, col: 2, row: 1 },
          { text: h.to, col: 3, row: 1 },
        ],
        rows: section.rows.map((r) => [r.sl, r.organisation, r.from, r.to, r.designation]),
        align: ["center", "left", "center", "center", "left"],
        minRowHeight: 18,
      },
      { title: section.title, total: section.total },
    );
  }

  drawDeclaration(w, model);

  doc.setTitle(model.blank ? "Resume template" : `Resume - ${model.name}`);
  doc.setAuthor("Venkat Sai Global");
  doc.setCreator("Venkat Sai Global");
  doc.setProducer("Venkat Sai Global");
  doc.setSubject("Resume");
  return doc.save();
}
