/**
 * Resume as Word (.docx) in the business's own layout: "RESUME" title, passport photo box at the top right,
 * LABEL : value block, passport table, experience tables (abroad, India) and an optional declaration.
 * A4, Times New Roman, plain black on white, bordered tables, no colours or logos.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type ITableCellBorders,
  type ParagraphChild,
} from "docx";

import type { ResumeDetails } from "../schemas";
import { buildResumeModel, type ResumeExperienceSection, type ResumeModel } from "./model";

const FONT = "Times New Roman";
/** Half-points. */
const BODY_SIZE = 22;
const TABLE_SIZE = 21;
const TITLE_SIZE = 40;

// Twips (1 cm = 567).
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 1134;
/** Slightly smaller top/bottom margins keep the blank template on one page in Word. */
const MARGIN_Y = 1000;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LABEL_W = 3600;
const COLON_W = 300;
const PHOTO_W = 2150;
const VALUE_W = CONTENT_WIDTH - LABEL_W - COLON_W - PHOTO_W;
/** Rows beside the photo; with ATLEAST heights below they make the box about 4.5 cm tall. */
const PHOTO_ROWS = 6;
const PHOTO_ROW_HEIGHT = 430;
/** Passport-size photo, 3.5 × 4.5 cm, in pixels at 96 dpi (docx image units). */
const PHOTO_PX = { width: 132, height: 170 };

const LINE = { style: BorderStyle.SINGLE, size: 6, color: "000000" } as const;
const NO_LINE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const BOXED: ITableCellBorders = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const UNBOXED: ITableCellBorders = { top: NO_LINE, bottom: NO_LINE, left: NO_LINE, right: NO_LINE };
const FLUSH = { top: 20, bottom: 20, left: 0, right: 0 };

type RunStyle = { bold?: boolean; underline?: boolean; size?: number };

function runs(text: string, style: RunStyle = {}): TextRun[] {
  const lines = text.split("\n");
  return lines.map(
    (line, i) =>
      new TextRun({
        text: line,
        font: FONT,
        size: style.size ?? BODY_SIZE,
        bold: style.bold,
        underline: style.underline ? {} : undefined,
        break: i > 0 ? 1 : undefined,
      }),
  );
}

function para(children: ParagraphChild[], opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {}): Paragraph {
  return new Paragraph({ children, alignment: opts.align, spacing: { before: opts.before ?? 0, after: opts.after ?? 0 } });
}

function cell(
  text: string,
  opts: { width: number; bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; borders?: ITableCellBorders; columnSpan?: number; rowSpan?: number } = { width: 0 },
): TableCell {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    borders: opts.borders,
    columnSpan: opts.columnSpan,
    rowSpan: opts.rowSpan,
    verticalAlign: VerticalAlignTable.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [para(runs(text, { bold: opts.bold, size: opts.size ?? TABLE_SIZE }), { align: opts.align })],
  });
}

function detailsTable(model: ResumeModel, photoJpeg: Uint8Array | null): Table {
  const photoRows = Math.min(PHOTO_ROWS, model.rows.length);
  const photoChildren = photoJpeg
    ? [
        para(
          [
            new ImageRun({
              type: "jpg",
              data: photoJpeg,
              transformation: PHOTO_PX,
              altText: { name: "Photo", description: "Passport-size photograph", title: "Photo" },
            }),
          ],
          { align: AlignmentType.CENTER },
        ),
      ]
    : [para([new TextRun({ text: "", font: FONT, size: BODY_SIZE })])];

  const rows = model.rows.map((row, i) => {
    const inPhotoZone = i < photoRows;
    const cells = [
      new TableCell({
        width: { size: LABEL_W, type: WidthType.DXA },
        borders: UNBOXED,
        margins: { top: 30, bottom: 30, left: 0, right: 60 },
        children: [para(runs(row.label, { bold: true }))],
      }),
      new TableCell({
        width: { size: COLON_W, type: WidthType.DXA },
        borders: UNBOXED,
        margins: { top: 30, bottom: 30, left: 0, right: 0 },
        children: [para(runs(":", { bold: true }))],
      }),
      new TableCell({
        width: { size: inPhotoZone ? VALUE_W : VALUE_W + PHOTO_W, type: WidthType.DXA },
        columnSpan: inPhotoZone ? undefined : 2,
        borders: UNBOXED,
        margins: { top: 30, bottom: 30, left: 60, right: 120 },
        children: [para(runs(row.value))],
      }),
    ];
    if (i === 0) {
      cells.push(
        new TableCell({
          width: { size: PHOTO_W, type: WidthType.DXA },
          rowSpan: photoRows,
          borders: BOXED,
          verticalAlign: VerticalAlignTable.CENTER,
          margins: { top: 30, bottom: 30, left: 30, right: 30 },
          children: photoChildren,
        }),
      );
    }
    return new TableRow({
      children: cells,
      height: inPhotoZone ? { value: PHOTO_ROW_HEIGHT, rule: HeightRule.ATLEAST } : undefined,
      cantSplit: true,
    });
  });

  return new Table({
    rows,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_W, COLON_W, VALUE_W, PHOTO_W],
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
  });
}

function heading(title: string, total?: string, before = 240): Paragraph {
  const children: ParagraphChild[] = [...runs(title, { bold: true, underline: true, size: 24 })];
  if (total) children.push(...runs(`  ${total}`, { bold: true, size: 24 }));
  return para(children, { before, after: 120 });
}

function passportTable(model: ResumeModel): Table {
  const w = Math.floor(CONTENT_WIDTH / 4);
  const widths = [w, w, w, CONTENT_WIDTH - 3 * w];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: model.passportHeaders.map((h, i) => cell(h, { width: widths[i]!, bold: true, align: AlignmentType.CENTER, borders: BOXED })) }),
      new TableRow({
        cantSplit: true,
        height: { value: 400, rule: HeightRule.ATLEAST },
        children: model.passportValues.map((v, i) => cell(v, { width: widths[i]!, align: AlignmentType.CENTER, borders: BOXED })),
      }),
    ],
  });
}

const EXP_WIDTHS = [800, 3700, 1450, 1450, CONTENT_WIDTH - 800 - 3700 - 1450 - 1450];

function experienceTable(model: ResumeModel, section: ResumeExperienceSection): Table {
  const h = model.experienceHeaders;
  const [slW, orgW, fromW, toW, desW] = EXP_WIDTHS as [number, number, number, number, number];
  const head = { bold: true, align: AlignmentType.CENTER, borders: BOXED } as const;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: EXP_WIDTHS,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          cell(h.sl, { ...head, width: slW, rowSpan: 2 }),
          cell(h.organisation, { ...head, width: orgW, rowSpan: 2 }),
          cell(h.period, { ...head, width: fromW + toW, columnSpan: 2 }),
          cell(h.designation, { ...head, width: desW, rowSpan: 2 }),
        ],
      }),
      new TableRow({ tableHeader: true, cantSplit: true, children: [cell(h.from, { ...head, width: fromW }), cell(h.to, { ...head, width: toW })] }),
      ...section.rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            height: { value: 400, rule: HeightRule.ATLEAST },
            children: [
              cell(r.sl, { width: slW, align: AlignmentType.CENTER, borders: BOXED }),
              cell(r.organisation, { width: orgW, borders: BOXED }),
              cell(r.from, { width: fromW, align: AlignmentType.CENTER, borders: BOXED }),
              cell(r.to, { width: toW, align: AlignmentType.CENTER, borders: BOXED }),
              cell(r.designation, { width: desW, borders: BOXED }),
            ],
          }),
      ),
    ],
  });
}

function declarationBlock(model: ResumeModel): (Paragraph | Table)[] {
  const d = model.declaration;
  if (!d) return [];
  const half = Math.floor(CONTENT_WIDTH / 2);
  const line = (left: string, right: string, rightBold = false) =>
    new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: half, type: WidthType.DXA }, borders: UNBOXED, margins: FLUSH, children: [para(runs(left))] }),
        new TableCell({ width: { size: CONTENT_WIDTH - half, type: WidthType.DXA }, borders: UNBOXED, margins: FLUSH, children: [para(runs(right, { bold: rightBold }), { align: AlignmentType.RIGHT })] }),
      ],
    });
  const rows = [line(`Place : ${d.place}`, ""), line("Date : ", "(SIGNATURE)", true)];
  if (d.name) rows.push(line("", d.name.toUpperCase()));
  return [
    heading(d.heading, undefined, 280),
    para(runs(d.text), { after: 240 }),
    new Table({ rows, width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [half, CONTENT_WIDTH - half], layout: TableLayoutType.FIXED, borders: TableBorders.NONE }),
  ];
}

export async function renderResumeDocx(details: ResumeDetails | null, opts: { photoJpeg?: Uint8Array | null; today?: Date } = {}): Promise<Uint8Array> {
  const model = buildResumeModel(details, { today: opts.today });
  const children: (Paragraph | Table)[] = [
    para(runs(model.title, { bold: true, underline: true, size: TITLE_SIZE }), { align: AlignmentType.CENTER, after: 240 }),
    detailsTable(model, opts.photoJpeg ?? null),
    heading(model.passportTitle),
    passportTable(model),
  ];
  for (const section of model.experience) {
    children.push(heading(section.title, section.total), experienceTable(model, section));
  }
  children.push(...declarationBlock(model));
  // Word always needs a paragraph after a final table; a 1 pt one keeps a full page from spilling onto a blank page.
  children.push(new Paragraph({ children: [new TextRun({ text: "", size: 2 })], spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT } }));

  const doc = new Document({
    creator: "Venkat Sai Global",
    title: model.blank ? "Resume template" : `Resume - ${model.name}`,
    description: "Resume prepared by Venkat Sai Global",
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE, color: "000000" } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN, right: MARGIN, header: 567, footer: 567 },
          },
        },
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
