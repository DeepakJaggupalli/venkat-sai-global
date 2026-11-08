import type { NextRequest } from "next/server";

import { formatExportDateTime } from "@/lib/xlsx-export";
import { staffExport } from "@/modules/exports/http";
import { candidatePeople, EMPTY_PERSON, type PersonColumns } from "@/modules/exports/people";
import { ENROLMENT_STATUS_LABELS } from "@/modules/training/constants";
import { getBatchForActor, listBatchEnrolments, type BatchEnrolmentItem } from "@/modules/training/queries";

import { isUuid } from "../../../../pipeline/_shared/server";

type Row = BatchEnrolmentItem & { person: PersonColumns };

/** GET /admin/training/batches/[id]/export — Excel download of a batch's enrolments (training.view or .manage). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return staffExport<Row>({
    permission: ["training.view", "training.manage"],
    mode: "any",
    list: "training_enrolments",
    slug: "training-enrolments",
    dataCategory: "contact",
    build: async (ctx) => {
      if (!isUuid(id)) return null;
      const found = await getBatchForActor(ctx, id).catch(() => null);
      if (!found) return null;
      const enrolments = await listBatchEnrolments(ctx, found.batch.id);
      const people = await candidatePeople(ctx, enrolments.map((e) => e.candidateId));
      return {
        title: `Training enrolments: ${found.batch.title} (${found.batch.code})`,
        filters: [],
        filterValues: { batchId: found.batch.id },
        total: enrolments.length,
        rows: enrolments.map((e) => ({ ...e, person: people.get(e.candidateId) ?? { ...EMPTY_PERSON, name: e.candidateName } })),
        columns: [
          { header: "Name", value: (r) => r.person.name || r.candidateName },
          { header: "Trade", value: (r) => r.person.trade },
          { header: "Passport No", value: (r) => r.person.passport },
          { header: "Phone number(s)", value: (r) => r.person.phone },
          { header: "Candidate notes", value: (r) => r.person.candidateNotes, wrap: true },
          { header: "Staff remarks", value: (r) => r.person.staffRemarks, wrap: true },
          { header: "Course", value: () => found.course.title },
          { header: "Batch", value: () => `${found.batch.title} (${found.batch.code})` },
          { header: "Status", value: (r) => ENROLMENT_STATUS_LABELS[r.status] ?? r.status },
          { header: "Applied", value: (r) => (r.appliedAt ? formatExportDateTime(r.appliedAt) : "") },
        ],
      };
    },
  });
}
