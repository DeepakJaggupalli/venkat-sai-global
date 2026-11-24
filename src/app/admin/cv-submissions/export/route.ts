import type { NextRequest } from "next/server";

import { cvSubmissionExportColumns } from "@/modules/exports/cv-submissions";
import { EXPORT_FETCH_LIMIT, queryObject, staffExport } from "@/modules/exports/http";
import { exportVisibility } from "@/modules/exports/people";
import { CV_FILE_FILTER_LABELS, CV_SUBMISSION_SOURCE_LABELS, CV_SUBMISSION_STATUS_LABELS, cvSubmissionFiltersSchema } from "@/modules/operations/cv-submission-schemas";
import { getCvRequirementTitle, listCvSubmissionsForExport, listCvSubmissionTrades, type CvSubmissionExportRow } from "@/modules/operations/cv-submissions";
import { countryOptions } from "@/modules/taxonomy/queries";

/**
 * GET /admin/cv-submissions/export?<list filters> — Excel download of the CV submissions list (candidates.view).
 * With ?requirement=<poster id> it is the applicant list of one requirement poster. Columns: S.No, Name, Trade,
 * Passport No, Exp Abroad (yrs), Exp India (yrs), Email, Phone, Applied for, Applied on, Status, Preferred country,
 * Passport expiry, Candidate notes, Staff remarks, then Total exp (yrs) and Reference. Masking and logging by the
 * exports module.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const query = queryObject(request.nextUrl);
  const first = (key: string) => {
    const v = query[key];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const filters = cvSubmissionFiltersSchema.parse({
    status: first("status"),
    trade: first("trade"),
    country: first("country"),
    q: first("q"),
    expiring: first("expiring"),
    requirement: first("requirement"),
    source: first("source"),
    cv: first("cv"),
  });
  return staffExport<CvSubmissionExportRow>({
    permission: "candidates.view",
    list: filters.requirement ? "requirement_applicants" : "cv_submissions",
    slug: filters.requirement ? "applicants" : "cv-submissions",
    dataCategory: "contact",
    build: async (ctx) => {
      const [{ rows, total }, trades, countries, requirementTitle] = await Promise.all([
        listCvSubmissionsForExport(ctx, filters, EXPORT_FETCH_LIMIT),
        filters.trade ? listCvSubmissionTrades(ctx) : Promise.resolve([]),
        filters.country ? countryOptions() : Promise.resolve([]),
        filters.requirement ? getCvRequirementTitle(ctx, filters.requirement) : Promise.resolve(null),
      ]);
      const labels = [
        filters.requirement ? `Applied for: ${requirementTitle ?? "selected requirement"}` : null,
        filters.status ? `Status: ${CV_SUBMISSION_STATUS_LABELS[filters.status]}` : null,
        filters.trade ? `Trade: ${trades.find((t) => t.value === filters.trade)?.label ?? "selected trade"}` : null,
        filters.country ? `Country: ${countries.find((c) => c.value === filters.country)?.label ?? filters.country}` : null,
        filters.source ? `Source: ${CV_SUBMISSION_SOURCE_LABELS[filters.source]}` : null,
        filters.cv ? CV_FILE_FILTER_LABELS[filters.cv] : null,
        filters.q ? `Search: "${filters.q}"` : null,
        filters.expiring ? "Passport expiring within 6 months" : null,
      ].filter((v): v is string => Boolean(v));
      return {
        title: filters.requirement ? `Applicants: ${requirementTitle ?? "requirement"}` : "Applicants and CVs",
        filters: labels,
        filterValues: filters,
        rows,
        total,
        columns: cvSubmissionExportColumns(exportVisibility(ctx)),
      };
    },
  });
}
