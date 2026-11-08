import { NextResponse, type NextRequest } from "next/server";

import { toCsv } from "@/components/employer-talent/report-utils";
import { logger } from "@/lib/logger";
import { getOrgContext, orgCan } from "@/modules/identity/authz";

import { pickReport, reportTable } from "../_lib/export-table";
import { buildReport } from "../_lib/model";
import { loadReportData, parseReportFilters } from "../_lib/queries";

/**
 * CSV export of the recruitment reports (employer.reports.view). Read-only GET scoped to the caller's
 * organisation; contains aggregate figures only (no candidate names or contact details).
 */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext("employer");
  if (!ctx) return new NextResponse("Sign in to export reports.", { status: 401 });
  if (!orgCan(ctx, "employer.reports.view")) return new NextResponse("You do not have permission to export reports.", { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const report = pickReport(params.report);
  const filters = parseReportFilters(params);

  try {
    const model = buildReport(await loadReportData(ctx, filters));
    const table = reportTable(model, report);
    const csv = toCsv(table.header, table.rows);
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
