import "server-only";

import { INTERVIEW_OUTCOME_LABELS, INTERVIEW_STATUS_LABELS } from "@/components/employer-talent/labels";
import { average, computeFunnels, daysBetween, FUNNEL_STEPS, groupHireSources, median, ratio, totalFunnel, type FunnelStepKey } from "@/components/employer-talent/report-utils";
import { RECOMMENDATION_LABELS } from "@/modules/recruitment/constants";

import type { ReportData, ReportJob } from "./queries";

export type JobReportRow = { job: ReportJob; counts: Record<FunnelStepKey, number>; conversion: number | null; timeToFillDays: number | null };

export type ReportModel = {
  rows: JobReportRow[];
  totals: Record<FunnelStepKey, number>;
  timeToFill: { median: number | null; average: number | null; filledJobs: number };
  timeToHire: { median: number | null; hires: number };
  sources: { key: string; label: string; value: number }[];
  interviewStatus: { key: string; label: string; value: number }[];
  interviewOutcomes: { key: string; label: string; value: number }[];
  recommendations: { key: string; label: string; value: number }[];
  interviewTotal: number;
};

const EMPTY_COUNTS: Record<FunnelStepKey, number> = { applied: 0, screened: 0, interviewed: 0, offered: 0, joined: 0 };

export function buildReport(data: ReportData): ReportModel {
  const funnels = new Map(computeFunnels(data.reach).map((f) => [f.jobId, f]));
  const rows: JobReportRow[] = data.jobs
    .map((job) => {
      const counts = funnels.get(job.id)?.counts ?? { ...EMPTY_COUNTS };
      const first = data.firstPlacementByJob[job.id];
      return { job, counts, conversion: ratio(counts.joined, counts.applied), timeToFillDays: first ? daysBetween(job.publishedAt, first) : null };
    })
    .sort((a, b) => b.counts.applied - a.counts.applied || a.job.title.localeCompare(b.job.title));

  const fills = rows.map((r) => r.timeToFillDays).filter((d): d is number => d !== null);
  const statusTotals = new Map<string, number>();
  const outcomeTotals = new Map<string, number>();
  for (const r of data.interviewStatus) {
    statusTotals.set(r.status, (statusTotals.get(r.status) ?? 0) + r.value);
    if (r.status === "completed") outcomeTotals.set(r.outcome, (outcomeTotals.get(r.outcome) ?? 0) + r.value);
  }

  return {
    rows,
    totals: totalFunnel([...funnels.values()]),
    timeToFill: { median: median(fills), average: average(fills), filledJobs: fills.length },
    timeToHire: { median: median(data.hireDays), hires: data.hireDays.length },
    sources: groupHireSources(data.hireSources),
    interviewStatus: Object.keys(INTERVIEW_STATUS_LABELS).map((k) => ({ key: k, label: INTERVIEW_STATUS_LABELS[k]!, value: statusTotals.get(k) ?? 0 })),
    interviewOutcomes: ["passed", "failed", "on_hold", "pending"].map((k) => ({ key: k, label: INTERVIEW_OUTCOME_LABELS[k]!, value: outcomeTotals.get(k) ?? 0 })),
    recommendations: Object.entries(RECOMMENDATION_LABELS).map(([k, label]) => ({ key: k, label, value: data.recommendations.find((r) => r.recommendation === k)?.value ?? 0 })),
    interviewTotal: [...statusTotals.values()].reduce((a, b) => a + b, 0),
  };
}

export const FUNNEL_LABELS = FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label }));
