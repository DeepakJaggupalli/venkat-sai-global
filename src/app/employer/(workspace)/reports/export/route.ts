import { NextResponse, type NextRequest } from "next/server";

import { FUNNEL_STEPS, toCsv } from "@/components/employer-talent/report-utils";
import { logger } from "@/lib/logger";
import { getOrgContext, orgCan } from "@/modules/identity/authz";

import { buildReport } from "../_lib/model";
import { loadReportData, parseReportFilters } from "../_lib/queries";

const REPORTS = ["jobs", "sources", "interviews"] as const;
type ReportKey = (typeof REPORTS)[number];

/**
 * CSV export of the recruitment reports (employer.reports.view). Read-only GET scoped to the caller's
 * organisation; contains aggregate figures only (no candidate names or contact details).
 */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext("employer");
  if (!ctx) return new NextResponse("Sign in to export reports.", { status: 401 });
  if (!orgCan(ctx, "employer.reports.view")) return new NextResponse("You do not have permission to export reports.", { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const report: ReportKey = (REPORTS as readonly string[]).includes(params.report ?? "") ? (params.report as ReportKey) : "jobs";
  const filters = parseReportFilters(params);

  try {
    const model = buildReport(await loadReportData(ctx, filters));
    let csv: string;
    if (report === "sources") {
      csv = toCsv(["Source of hire", "Hires"], model.sources.map((s) => [s.label, s.value]));
    } else if (report === "interviews") {
      csv = toCsv(
        ["Group", "Value", "Count"],
        [
          ...model.interviewStatus.map((s) => ["Status", s.label, s.value] as const),
          ...model.interviewOutcomes.map((s) => ["Outcome (completed interviews)", s.label, s.value] as const),
          ...model.recommendations.map((s) => ["Your team's recommendation", s.label, s.value] as const),
        ],
      );
    } else {
      csv = toCsv(
        ["Job code", "Job title", "Status", "Openings", ...FUNNEL_STEPS.map((s) => s.label), "Applied to joined (%)", "Days to first hire"],
        model.rows.map((r) => [
          r.job.code,
          r.job.title,
          r.job.status,
          r.job.openings,
          ...FUNNEL_STEPS.map((s) => r.counts[s.key]),
          r.conversion === null ? "" : Math.round(r.conversion * 1000) / 10,
          r.timeToFillDays ?? "",
        ]),
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="recruitment-${report}-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("Employer report export failed", { error: err, report });
    return new NextResponse("The report could not be exported. Please try again.", { status: 500 });
  }
}
