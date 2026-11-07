import { z } from "zod";

import { ActionError } from "@/lib/actions";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { EXPORT_DATASETS } from "@/modules/analytics/schemas";
import { exportAnalyticsCsv } from "@/modules/analytics/service";
import { requireStaff } from "@/modules/identity/authz";

/**
 * GET /admin/analytics/exports/download?dataset=events|sessions|daily_metrics&range=…[&from=&to=]
 * CSV download of pseudonymous analytics data (≤ 50,000 rows, no visitor or user ids). Read-only, so no
 * CSRF check is needed; authorisation is analytics.export and the module audits every export.
 */
export async function GET(request: Request): Promise<Response> {
  const staff = await requireStaff("analytics.export");
  const url = new URL(request.url);
  const dataset = z.enum(EXPORT_DATASETS).safeParse(url.searchParams.get("dataset"));
  if (!dataset.success) return new Response("Choose a dataset: events, sessions or daily_metrics.", { status: 400 });

  const range = getAnalyticsRange({
    range: url.searchParams.get("range") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  try {
    const result = await exportAnalyticsCsv(staff, dataset.data, range);
    const filename = result.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(`﻿${result.csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Rows": String(result.rows),
        "X-Export-Truncated": result.truncated ? "1" : "0",
      },
    });
  } catch (err) {
    if (err instanceof ActionError) {
      const status = err.code === "forbidden" ? 403 : 400;
      return new Response(err.message, { status });
    }
    throw err;
  }
}
