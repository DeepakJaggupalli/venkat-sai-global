import { getOrgContext } from "@/modules/identity/authz";
import { getCurrentUser } from "@/modules/identity/session";

import { getCourseReport } from "../../_lib/queries";
import { courseReportCsv } from "../../_lib/report";

/**
 * GET /institution/reports/export — CSV of per-course outcomes for the caller's active institution
 * (institution.reports.view). Aggregate counts only: no learner names or contact details.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download this report.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const ctx = await getOrgContext("institution");
  if (!ctx || !ctx.permissions.has("institution.reports.view")) return new Response("You do not have access to this report.", { status: 403, headers: { "Cache-Control": "no-store" } });

  const rows = await getCourseReport(ctx);
  const date = new Date().toISOString().slice(0, 10);
  const safeSlug = ctx.organization.slug.replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "institution";
  return new Response(courseReportCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeSlug}-outcomes-${date}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
