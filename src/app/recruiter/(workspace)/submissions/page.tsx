import type { Metadata } from "next";
import { Inbox } from "lucide-react";

import { labelOf, SUBMISSION_STATUS } from "@/components/recruiter/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { SUBMISSION_STATUS_OPTIONS } from "@/modules/recruitment/constants";
import { listSubmissionsForPartner } from "@/modules/recruitment/queries";

import { sp } from "../_lib/page-utils";

export const metadata: Metadata = { title: "Submissions" };

type Status = (typeof SUBMISSION_STATUS_OPTIONS)[number];

export default async function RecruiterSubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.submissions.view");
  const params = await searchParams;
  const raw = sp(params, "status");
  const status = SUBMISSION_STATUS_OPTIONS.includes(raw as Status) ? (raw as Status) : undefined;
  const page = parsePage(params, { defaultSize: 25 });
  const result = await listSubmissionsForPartner(ctx, { status }, page);

  return (
    <div className="space-y-6">
      <PageHeader title="Submissions" description="Every candidate your agency submitted, with Venkat Sai's review, feedback and hiring progress." />

      <FilterBar paramKeys={["status"]} label="Filter submissions">
        <FilterSelect param="status" label="Status" allLabel="All statuses" options={SUBMISSION_STATUS_OPTIONS.map((v) => ({ value: v, label: SUBMISSION_STATUS[v]!.label }))} />
      </FilterBar>

      <DataTable
        caption="Your submissions"
        rows={result.items}
        getRowId={(s) => s.id}
        rowLink={(s) => ({ href: `/recruiter/submissions/${s.id}`, label: `Open submission of ${s.candidate.displayName}` })}
        columns={[
          {
            id: "candidate",
            header: "Candidate",
            primary: true,
            cell: (s) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{s.candidate.displayName}</p>
                <p className="text-xs text-muted-foreground">{s.code}</p>
              </div>
            ),
          },
          { id: "job", header: "Job", cell: (s) => s.jobTitle ?? "To be decided by Venkat Sai" },
          { id: "submitted", header: "Submitted", cell: (s) => <DateText value={s.createdAt} />, nowrap: true },
          {
            id: "status",
            header: "Status",
            cell: (s) => {
              const st = labelOf(SUBMISSION_STATUS, s.status);
              return (
                <StatusBadge tone={st.tone} size="sm">
                  {st.label}
                </StatusBadge>
              );
            },
          },
          { id: "stage", header: "Hiring stage", cell: (s) => s.application?.stageName || "—", hideOnMobile: true },
          {
            id: "feedback",
            header: "Feedback",
            hideOnMobile: true,
            cell: (s) => (s.partnerFeedback ? <span className="line-clamp-2 text-sm">{s.partnerFeedback}</span> : <span className="text-muted-foreground">—</span>),
          },
        ]}
        empty={
          <EmptyState
            icon={<Inbox aria-hidden="true" />}
            title={status ? "No submissions with this status" : "No submissions yet"}
            description="Open an assigned requirement and submit a consenting candidate. Their progress will appear here."
            primaryAction={{ label: "View requirements", href: "/recruiter/requirements" }}
          />
        }
        footer={
          result.pageCount > 1 ? (
            <Pagination pathname="/recruiter/submissions" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="submissions" />
          ) : null
        }
      />
    </div>
  );
}
