import type { NextRequest } from "next/server";

import { formatExportDateTime } from "@/lib/xlsx-export";
import { EXPORT_FETCH_LIMIT, staffExport } from "@/modules/exports/http";
import { candidatePeople, EMPTY_PERSON, type PersonColumns } from "@/modules/exports/people";
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_OPTIONS } from "@/modules/recruitment/constants";
import type { StaffSubmissionReviewItem } from "@/modules/recruitment/partner-queries";
import { listSubmissionsForStaff } from "@/modules/recruitment/queries";

import { isUuid, pickEnum } from "../../../pipeline/_shared/server";

type Row = StaffSubmissionReviewItem & { person: PersonColumns };

/** GET /admin/partners/submissions/export?status&partner&assignment — Excel download of partner submissions. */
export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const statusParam = p.get("status") ?? undefined;
  const status = pickEnum(statusParam, SUBMISSION_STATUS_OPTIONS);
  const queue = !status && statusParam !== "all";
  const partner = p.get("partner");
  const assignment = p.get("assignment");
  const filters = { status, queue, partnerOrganizationId: isUuid(partner) ? partner : undefined, assignmentId: isUuid(assignment) ? assignment : undefined };
  return staffExport<Row>({
    permission: ["recruitment.view", "recruitment.manage", "partners.view"],
    mode: "any",
    list: "partner_submissions",
    slug: "partner-submissions",
    dataCategory: "contact",
    build: async (ctx) => {
      const result = await listSubmissionsForStaff(ctx, filters, { page: 1, pageSize: EXPORT_FETCH_LIMIT, offset: 0 });
      const people = await candidatePeople(ctx, result.items.map((s) => s.candidate.id));
      const partnerName = filters.partnerOrganizationId ? result.items[0]?.partner.name : null;
      const labels = [
        queue ? "Review queue (submitted, under review, duplicate)" : status ? `Status: ${SUBMISSION_STATUS_LABELS[status]}` : "All submissions",
        filters.partnerOrganizationId ? `Partner: ${partnerName ?? "selected partner"}` : null,
        filters.assignmentId ? "Assignment: selected assignment" : null,
      ].filter((v): v is string => Boolean(v));
      return {
        title: "Partner submissions",
        filters: labels,
        filterValues: filters,
        total: result.total,
        rows: result.items.map((s) => ({ ...s, person: people.get(s.candidate.id) ?? { ...EMPTY_PERSON, name: s.candidate.displayName } })),
        columns: [
          { header: "Name", value: (r) => r.person.name || r.candidate.displayName },
          { header: "Trade", value: (r) => r.person.trade },
          { header: "Passport No", value: (r) => r.person.passport },
          { header: "Phone number(s)", value: (r) => r.person.phone },
          { header: "Candidate notes", value: (r) => r.partnerNotes?.trim() || r.person.candidateNotes, wrap: true },
          { header: "Staff remarks", value: (r) => [r.reviewNotes?.trim(), r.person.staffRemarks].filter(Boolean).join(" | "), wrap: true },
          { header: "Partner", value: (r) => r.partner.name },
          { header: "Job / requirement", value: (r) => r.jobTitle ?? "Requirement (job to choose)" },
          { header: "Status", value: (r) => SUBMISSION_STATUS_LABELS[r.status] ?? r.status },
          { header: "Application", value: (r) => (r.application ? `${r.application.code} (${r.application.stageName})` : "") },
          { header: "Submission", value: (r) => r.code },
          { header: "Submitted", value: (r) => formatExportDateTime(r.createdAt) },
        ],
      };
    },
  });
}
