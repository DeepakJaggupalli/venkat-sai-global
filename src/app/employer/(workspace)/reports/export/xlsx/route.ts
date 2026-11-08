import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { buildXlsx, exportFilename, xlsxResponse } from "@/lib/xlsx-export";
import { audit } from "@/modules/audit";
import { getOrgContext, orgCan } from "@/modules/identity/authz";

import { pickReport, REPORT_TITLES, reportTable } from "../../_lib/export-table";
import { buildReport } from "../../_lib/model";
import { loadReportData, parseReportFilters } from "../../_lib/queries";

/**
 * Excel (.xlsx) export of the recruitment reports, next to the CSV (employer.reports.view). Scoped to the caller's
 * organisation; aggregate figures only (no candidate names, contact details or passport numbers). Audited.
 */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext("employer");
  if (!ctx) return new NextResponse("Sign in to export reports.", { status: 401 });
  if (!orgCan(ctx, "employer.reports.view")) return new NextResponse("You do not have permission to export reports.", { status: 403 });
  const limit = await rateLimit(`employer:xlsx-export:${ctx.user.id}`, 30, 3600);
  if (!limit.allowed) return new NextResponse("Too many downloads. Try again later.", { status: 429 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const report = pickReport(params.report);
  const filters = parseReportFilters(params);

  try {
    const model = buildReport(await loadReportData(ctx, filters));
    const table = reportTable(model, report);
    const labels = [filters.fromIso ? `From ${filters.fromIso}` : null, filters.toIso ? `To ${filters.toIso}` : null, filters.jobId ? "One job" : null].filter((v): v is string => Boolean(v));
    const generatedAt = new Date();
    const bytes = await buildXlsx({
      title: `Recruitment report: ${REPORT_TITLES[report]} (${ctx.organization.name})`,
      filters: labels,
      rows: table.rows,
      columns: table.header.map((header, i) => ({ header, value: (row: (string | number)[]) => row[i] })),
      generatedAt,
    });
    await audit({ action: "export.downloaded", entityType: "export", entityId: null, organizationId: ctx.organization.id, actorUserId: ctx.user.id, metadata: { list: `employer_report_${report}`, rowCount: table.rows.length, filters: { from: filters.fromIso, to: filters.toIso, jobId: filters.jobId }, format: "xlsx" } });
    return xlsxResponse(bytes, exportFilename(`recruitment-${report}`, generatedAt));
  } catch (err) {
    logger.error("Employer report Excel export failed", { error: err, report });
    return new NextResponse("The report could not be exported. Please try again.", { status: 500 });
  }
}
