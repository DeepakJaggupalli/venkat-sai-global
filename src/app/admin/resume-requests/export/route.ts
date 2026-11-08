import type { NextRequest } from "next/server";

import { formatExportDateTime, maskPassportNumber } from "@/lib/xlsx-export";
import { EXPORT_FETCH_LIMIT, staffExport } from "@/modules/exports/http";
import { exportVisibility } from "@/modules/exports/people";
import { RESUME_REQUEST_STATUS_LABELS, resumeRequestFiltersSchema } from "@/modules/resume-service/schemas";
import { listResumeRequestsWithPassport, type ResumeRequestExportRow } from "@/modules/resume-service/service";

/** GET /admin/resume-requests/export?q&status — Excel download of resume requests (candidates.manage). */
export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const filters = resumeRequestFiltersSchema.parse({ status: p.get("status") ?? undefined, q: p.get("q") ?? undefined });
  return staffExport<ResumeRequestExportRow>({
    permission: "candidates.manage",
    list: "resume_requests",
    slug: "resume-requests",
    dataCategory: "identity",
    build: async (ctx) => {
      const visibility = exportVisibility(ctx);
      const { rows, total } = await listResumeRequestsWithPassport(ctx, filters, EXPORT_FETCH_LIMIT);
      return {
        title: "Resume requests",
        filters: [filters.status ? `Status: ${RESUME_REQUEST_STATUS_LABELS[filters.status]}` : null, filters.q ? `Search: "${filters.q}"` : null].filter((v): v is string => Boolean(v)),
        filterValues: filters,
        total,
        rows,
        columns: [
          { header: "Name", value: (r) => r.name },
          { header: "Trade", value: (r) => r.postAppliedFor },
          { header: "Passport No", value: (r) => (visibility.fullPassport && r.passportNumber ? r.passportNumber : maskPassportNumber(r.passportLast4)) },
          { header: "Phone number(s)", value: (r) => [r.phone, r.alternatePhone].filter(Boolean).join(" / ") },
          { header: "Candidate notes", value: (r) => r.candidateNotes, wrap: true },
          { header: "Staff remarks", value: (r) => r.staffNotes, wrap: true },
          { header: "Price", value: (r) => r.priceLabel },
          { header: "Payment reference", value: (r) => r.paymentReference },
          { header: "Status", value: (r) => RESUME_REQUEST_STATUS_LABELS[r.status] },
          { header: "Reference", value: (r) => r.code },
          { header: "Received", value: (r) => formatExportDateTime(r.createdAt) },
        ],
      };
    },
  });
}
