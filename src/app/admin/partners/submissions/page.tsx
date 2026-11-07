import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_OPTIONS } from "@/modules/recruitment/constants";
import { listSubmissionsForStaff } from "@/modules/recruitment/queries";

import { partnerOptions } from "../../pipeline/_shared/options";
import { isUuid, optionsFrom, pickEnum, staffTimeZone } from "../../pipeline/_shared/server";
import { statusTone } from "../../pipeline/_shared/status";
import { PartnerTabs } from "../_components/partner-tabs";

export const metadata: Metadata = { title: "Submissions · Partners" };

export default async function PartnerSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["recruitment.view", "recruitment.manage", "partners.view"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const statusParam = sp(params, "status");
  const status = pickEnum(statusParam, SUBMISSION_STATUS_OPTIONS);
  const queue = !status && statusParam !== "all";
  const partnerParam = sp(params, "partner");
  const assignmentParam = sp(params, "assignment");
  const [result, partners] = await Promise.all([
    listSubmissionsForStaff(staff, { status, queue, partnerOrganizationId: isUuid(partnerParam) ? partnerParam : undefined, assignmentId: isUuid(assignmentParam) ? assignmentParam : undefined }, page),
    partnerOptions(),
  ]);
  const tz = staffTimeZone(staff);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submission review"
        description="Candidates submitted by partners. Check duplicates, attribution and consent, then accept into the pipeline or reject with feedback."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Partners", href: "/admin/partners" }, { label: "Submissions" }]}
      />
      <PartnerTabs />
      <FilterScope>
        <FilterBar paramKeys={["status", "partner", "assignment"]}>
          <FilterSelect param="status" label="Status" allLabel="Review queue" options={[...optionsFrom(SUBMISSION_STATUS_OPTIONS, SUBMISSION_STATUS_LABELS), { value: "all", label: "All submissions" }]} />
          <FilterSelect param="partner" label="Partner" allLabel="All partners" options={partners} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Partner submissions"
            rows={result.items}
            getRowId={(s) => s.id}
            rowLink={(s) => ({ href: `/admin/partners/submissions/${s.id}`, label: `Review submission ${s.code}` })}
            columns={[
              { id: "candidate", header: "Candidate", primary: true, cell: (s) => (<div><p className="font-medium">{s.candidate.displayName}</p><p className="font-mono text-xs text-muted-foreground">{s.code}</p></div>) },
              { id: "partner", header: "Partner", cell: (s) => s.partner.name },
              { id: "job", header: "Job", hideOnMobile: true, cell: (s) => s.jobTitle ?? "Requirement (job to choose)" },
              {
                id: "checks",
                header: "Checks",
                cell: (s) => (
                  <div className="flex flex-wrap gap-1">
                    {s.openDuplicateFlags ? <StatusBadge tone="warning" size="sm">{`${s.openDuplicateFlags} possible duplicate${s.openDuplicateFlags === 1 ? "" : "s"}`}</StatusBadge> : null}
                    {s.activeAttribution && s.activeAttribution.partnerOrganizationId !== s.partner.id ? <StatusBadge tone="danger" size="sm">Attributed to another partner</StatusBadge> : null}
                    {!s.candidateAllowsPartnerSubmissions ? <StatusBadge tone="warning" size="sm">Confirm consent</StatusBadge> : null}
                    {!s.openDuplicateFlags && !s.activeAttribution && s.candidateAllowsPartnerSubmissions ? <span className="text-xs text-muted-foreground">No issues found</span> : null}
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (s) => <StatusBadge tone={statusTone(s.status)} size="sm">{SUBMISSION_STATUS_LABELS[s.status]}</StatusBadge> },
              { id: "date", header: "Submitted", hideOnMobile: true, cell: (s) => <DateText value={s.createdAt} timeZone={tz} /> },
            ]}
            empty={<EmptyState title={queue ? "The review queue is empty" : "No submissions found"} description={queue ? "New partner submissions appear here for review." : "Try different filters."} />}
            footer={<Pagination pathname="/admin/partners/submissions" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="submissions" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
