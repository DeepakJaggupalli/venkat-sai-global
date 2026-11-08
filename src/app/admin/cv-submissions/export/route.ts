import type { NextRequest } from "next/server";

import { formatExportDateTime } from "@/lib/xlsx-export";
import { EXPORT_FETCH_LIMIT, staffExport } from "@/modules/exports/http";
import { exportVisibility, formatPassport, formatPhone } from "@/modules/exports/people";
import { CV_SUBMISSION_STATUS_LABELS, cvSubmissionFiltersSchema } from "@/modules/operations/cv-submission-schemas";
import { listCvSubmissionsForExport, listCvSubmissionTrades, type CvSubmissionExportRow } from "@/modules/operations/cv-submissions";
import { countryOptions } from "@/modules/taxonomy/queries";

/** GET /admin/cv-submissions/export?<list filters> — Excel download of the CV submissions list (candidates.view). */
export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const filters = cvSubmissionFiltersSchema.parse({ status: p.get("status") ?? undefined, trade: p.get("trade") ?? undefined, country: p.get("country") ?? undefined, q: p.get("q") ?? undefined });
  return staffExport<CvSubmissionExportRow>({
    permission: "candidates.view",
    list: "cv_submissions",
    slug: "cv-submissions",
    dataCategory: "contact",
    build: async (ctx) => {
      const visibility = exportVisibility(ctx);
      const [{ rows, total }, trades, countries] = await Promise.all([listCvSubmissionsForExport(ctx, filters, EXPORT_FETCH_LIMIT), listCvSubmissionTrades(ctx), countryOptions()]);
      const labels = [
        filters.status ? `Status: ${CV_SUBMISSION_STATUS_LABELS[filters.status]}` : null,
        filters.trade ? `Trade: ${trades.find((t) => t.value === filters.trade)?.label ?? "selected trade"}` : null,
        filters.country ? `Country: ${countries.find((c) => c.value === filters.country)?.label ?? filters.country}` : null,
        filters.q ? `Search: "${filters.q}"` : null,
      ].filter((v): v is string => Boolean(v));
      return {
        title: "CV submissions",
        filters: labels,
        filterValues: filters,
        rows,
        total,
        columns: [
          { header: "Name", value: (r) => r.name },
          { header: "Trade", value: (r) => r.tradeLabel },
          { header: "Passport No", value: (r) => formatPassport(visibility, r.passportEncrypted, r.passportLast4) || (r.hasPassport === true ? "Has passport" : r.hasPassport === false ? "No passport" : "") },
          { header: "Phone number(s)", value: (r) => formatPhone(visibility, r.phone) },
          { header: "Candidate notes", value: (r) => r.candidateNotes, wrap: true },
          { header: "Staff remarks", value: (r) => r.staffRemarks, wrap: true },
          { header: "Experience (years)", value: (r) => r.experienceYears },
          { header: "Preferred country", value: (r) => r.countryName ?? "Any" },
          { header: "Requirement", value: (r) => r.requirementTitle ?? "General CV" },
          { header: "Status", value: (r) => CV_SUBMISSION_STATUS_LABELS[r.status] },
          { header: "Reference", value: (r) => r.code },
          { header: "Received", value: (r) => formatExportDateTime(r.createdAt) },
        ],
      };
    },
  });
}
