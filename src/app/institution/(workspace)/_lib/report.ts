/**
 * Institution outcome report: rate derivation and CSV export (pure, unit-tested).
 * Rates are null when there is nothing to divide by; nothing is estimated.
 */

export type ReportRowInput = {
  code: string;
  title: string;
  status: string;
  batches: number;
  enrolled: number;
  completed: number;
  dropped: number;
  passed: number;
  failed: number;
  certificates: number;
  placedLearners: number;
  verifiedPlacedLearners: number;
};

export type ReportRates = { completionRate: number | null; passRate: number | null; placementRate: number | null };

function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Completion rate = completed / (completed + dropped) — learners still in training are not counted.
 * Pass rate = passed / (passed + failed) — pending and ungraded results are not counted.
 * Placement rate = placed learners / completed learners (self-reported and verified; verified shown separately).
 */
export function reportRates(row: Pick<ReportRowInput, "completed" | "dropped" | "passed" | "failed" | "placedLearners">): ReportRates {
  return {
    completionRate: rate(row.completed, row.completed + row.dropped),
    passRate: rate(row.passed, row.passed + row.failed),
    placementRate: rate(Math.min(row.placedLearners, row.completed || row.placedLearners), row.completed),
  };
}

/** Escape one CSV cell (RFC 4180) and neutralise spreadsheet formulas (=, +, -, @, tab, CR). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const REPORT_HEADERS = [
  "Course code",
  "Course",
  "Status",
  "Batches",
  "Learners enrolled",
  "Completed",
  "Dropped out",
  "Passed",
  "Not passed",
  "Completion rate %",
  "Pass rate %",
  "Certificates active",
  "Learners placed (all reported)",
  "Learners placed (verified)",
  "Placement rate %",
] as const;

export function courseReportCsv(rows: readonly ReportRowInput[]): string {
  const lines = [REPORT_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const rates = reportRates(r);
    lines.push(
      [
        r.code,
        r.title,
        r.status,
        r.batches,
        r.enrolled,
        r.completed,
        r.dropped,
        r.passed,
        r.failed,
        rates.completionRate,
        rates.passRate,
        r.certificates,
        r.placedLearners,
        r.verifiedPlacedLearners,
        rates.placementRate,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM so spreadsheet apps open UTF-8 (Hindi / Telugu course names) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
