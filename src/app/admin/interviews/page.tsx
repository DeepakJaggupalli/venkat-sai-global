import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar, FilterPendingRegion, FilterScope, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { INTERVIEW_MODE_LABELS } from "@/modules/recruitment/constants";
import { listInterviewsForStaff } from "@/modules/recruitment/queries";
import { formatInTimeZone } from "@/modules/recruitment/timezone";

import { jobFilterOptions } from "../pipeline/_shared/options";
import { hoursAgo, isUuid, pickEnum } from "../pipeline/_shared/server";
import { humanize, statusTone } from "../pipeline/_shared/status";

export const metadata: Metadata = { title: "Interviews" };

const STATUSES = ["scheduled", "rescheduled", "completed", "cancelled", "no_show"] as const;

function day(value: string | undefined, end = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["recruitment.view", "recruitment.manage"], "any");
  const params = await searchParams;
  const page = parsePage(params, { defaultSize: 25 });
  const status = pickEnum(sp(params, "status"), STATUSES);
  const jobParam = sp(params, "job");
  const upcomingDefault = !sp(params, "from") && !sp(params, "to") && !status && sp(params, "range") !== "all";
  const from = day(sp(params, "from")) ?? (upcomingDefault ? hoursAgo(6) : undefined);
  const [result, jobs] = await Promise.all([
    listInterviewsForStaff(staff, { status, jobId: isUuid(jobParam) ? jobParam : undefined, from, to: day(sp(params, "to"), true) }, page),
    jobFilterOptions(),
  ]);
  const canManage = staffCan(staff, "recruitment.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        description={upcomingDefault ? "Upcoming interviews across every employer. Times show in each interview's own time zone." : "Interviews across every employer. Times show in each interview's own time zone."}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Interviews" }]}
        actions={canManage ? [{ label: "Schedule an interview", href: "/admin/interviews/new" }] : undefined}
      />
      <FilterScope>
        <FilterBar paramKeys={["status", "job", "from", "to", "range"]}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
          <FilterSelect param="job" label="Job" allLabel="All jobs" options={jobs} />
          <FilterSelect param="range" label="Period" allLabel="Upcoming" options={[{ value: "all", label: "All dates" }]} />
          <DateRangeFilter label="Date" />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Interviews"
            rows={result.items}
            getRowId={(i) => i.id}
            rowLink={(i) => ({ href: `/admin/interviews/${i.id}`, label: `Open interview ${i.code}` })}
            columns={[
              { id: "when", header: "When", primary: true, cell: (i) => (<div><p className="font-medium">{formatInTimeZone(i.scheduledStart, i.timezone)}</p><p className="text-xs text-muted-foreground">{i.timezone}</p></div>) },
              { id: "candidate", header: "Candidate", cell: (i) => (<div><p>{i.candidateName}</p><p className="font-mono text-xs text-muted-foreground">{i.applicationCode}</p></div>) },
              { id: "job", header: "Job and round", cell: (i) => (<div><p>{i.jobTitle}</p><p className="text-xs text-muted-foreground">{i.roundName} · {INTERVIEW_MODE_LABELS[i.mode]}</p></div>) },
              { id: "by", header: "Conducted by", hideOnMobile: true, cell: (i) => (i.conductedBy === "venkat_sai" ? "Venkat Sai" : "Employer") },
              { id: "response", header: "Candidate", hideOnMobile: true, cell: (i) => humanize(i.candidateResponse) },
              { id: "status", header: "Status", cell: (i) => <StatusBadge tone={statusTone(i.status)} size="sm">{humanize(i.status)}</StatusBadge> },
            ]}
            empty={<EmptyState title={upcomingDefault ? "No upcoming interviews" : "No interviews found"} description="Interviews scheduled by employers or by Venkat Sai on their behalf appear here." primaryAction={canManage ? { label: "Schedule an interview", href: "/admin/interviews/new" } : undefined} />}
            footer={<Pagination pathname="/admin/interviews" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="interviews" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
