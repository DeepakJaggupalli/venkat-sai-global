import { FUNNEL_STEPS } from "@/components/employer-talent/report-utils";

import type { ReportModel } from "./model";

export const REPORT_KEYS = ["jobs", "sources", "interviews"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_TITLES: Record<ReportKey, string> = { jobs: "Funnel by job", sources: "Source of hire", interviews: "Interview outcomes" };

export function pickReport(value: string | null | undefined): ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value ?? "") ? (value as ReportKey) : "jobs";
}

/** The rows of one report as a plain table (shared by the CSV and Excel downloads). Aggregates only, no people. */
export function reportTable(model: ReportModel, report: ReportKey): { header: string[]; rows: (string | number)[][] } {
  if (report === "sources") return { header: ["Source of hire", "Hires"], rows: model.sources.map((s) => [s.label, s.value]) };
  if (report === "interviews") {
    return {
      header: ["Group", "Value", "Count"],
      rows: [
        ...model.interviewStatus.map((s) => ["Status", s.label, s.value]),
        ...model.interviewOutcomes.map((s) => ["Outcome (completed interviews)", s.label, s.value]),
        ...model.recommendations.map((s) => ["Your team's recommendation", s.label, s.value]),
      ],
    };
  }
  return {
    header: ["Job code", "Job title", "Status", "Openings", ...FUNNEL_STEPS.map((s) => s.label), "Applied to joined (%)", "Days to first hire"],
    rows: model.rows.map((r) => [
      r.job.code,
      r.job.title,
      r.job.status,
      r.job.openings,
      ...FUNNEL_STEPS.map((s) => r.counts[s.key]),
      r.conversion === null ? "" : Math.round(r.conversion * 1000) / 10,
      r.timeToFillDays ?? "",
    ]),
  };
}
