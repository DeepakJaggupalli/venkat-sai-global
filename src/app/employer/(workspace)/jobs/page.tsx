import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";

import { JOB_STATUS_TAB_LABELS } from "@/components/employer/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterScope, FilterPendingRegion, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { sp as readParam, type SearchParams } from "@/lib/http";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { JOB_STATUS_OPTIONS } from "@/modules/jobs/constants";
import { countEmployerJobsByStatus, listEmployerJobs } from "@/modules/jobs/queries";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import type { JobCard } from "@/modules/jobs/types";

export const metadata: Metadata = { title: "Jobs" };

const DISPLAY_OVERRIDES = { scheduled: { tone: "info" as const, label: "Scheduled" }, expired: { tone: "warning" as const, label: "Deadline passed" } };

export default async function EmployerJobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", "employer.jobs.view");
  const sp = await searchParams;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canManage = orgCan(ctx, "employer.jobs.manage");
  const canPipeline = orgCan(ctx, "employer.pipeline.view");

  const rawStatus = readParam(sp, "status");
  const status = (JOB_STATUS_OPTIONS as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as (typeof JOB_STATUS_OPTIONS)[number]) : undefined;
  const filters = parseJobSearchParams({ q: readParam(sp, "q"), page: readParam(sp, "page"), sort: "newest", pageSize: "20", statuses: status ? [status] : [] });
  const [result, counts] = await Promise.all([listEmployerJobs(ctx, filters), countEmployerJobsByStatus(ctx)]);
  const total = Object.entries(counts).reduce((sum, [key, n]) => (key === "archived" ? sum : sum + n), 0);
  const q = readParam(sp, "q");

  const tabs = [
    { href: "/employer/jobs", label: "All", count: total },
    ...JOB_STATUS_OPTIONS.filter((s) => counts[s] > 0 || s === "draft" || s === "published").map((s) => ({ href: `/employer/jobs?status=${s}`, label: JOB_STATUS_TAB_LABELS[s], count: counts[s] })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Create, submit and track your job postings. Venkat Sai reviews every job before it is published."
        actions={canManage ? [{ label: "Post a job", href: "/employer/jobs/new" }] : undefined}
      />
      <LinkTabs items={tabs} label="Job status" activeHref={status ? `/employer/jobs?status=${status}` : "/employer/jobs"} />
      <FilterScope>
        <FilterBar paramKeys={["q"]} search={<SearchInput label="Search your jobs" placeholder="Title, skill or city" />}>
          {null}
        </FilterBar>
        <FilterPendingRegion>
          <DataTable<JobCard>
            caption="Your jobs"
            rows={result.items}
            getRowId={(j) => j.id}
            rowLink={(j) => ({ href: `/employer/jobs/${j.id}`, label: `Open ${j.title}` })}
            columns={[
              {
                id: "title",
                header: "Job",
                primary: true,
                cell: (j) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{j.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {j.code}
                      {j.isOverseas ? " · Overseas" : ""}
                      {j.isFeatured ? " · Featured" : ""}
                    </p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (j) => <StatusBadge status={j.displayStatus} domain="job" size="sm" overrides={DISPLAY_OVERRIDES} /> },
              { id: "location", header: "Location", hideOnMobile: true, cell: (j) => [j.location.city, j.location.countryName].filter(Boolean).join(", ") || "Remote" },
              {
                id: "applications",
                header: "Applications",
                align: "right",
                cell: (j) =>
                  canPipeline && (j.status === "published" || j.status === "paused" || j.status === "closed") ? (
                    <Link href={`/employer/jobs/${j.id}/pipeline`} className="relative z-10 font-medium text-teal-strong underline-offset-4 hover:underline">
                      {j.applicationCount ?? 0}
                      <span className="sr-only"> applications, open pipeline for {j.title}</span>
                    </Link>
                  ) : (
                    (j.applicationCount ?? 0)
                  ),
              },
              { id: "views", header: "Views", align: "right", hideOnMobile: true, cell: (j) => j.viewCount ?? 0 },
              { id: "closes", header: "Closes", hideOnMobile: true, nowrap: true, cell: (j) => (j.closesAt ? <DateText value={j.closesAt} timeZone={timeZone} /> : "—") },
            ]}
            empty={
              <EmptyState
                icon={<Briefcase aria-hidden="true" />}
                title={q || status ? "No jobs match" : "No jobs yet"}
                description={q || status ? "Try another search or status." : "Post your first job. You can save it as a draft and submit it once your company is verified."}
                primaryAction={canManage && !q && !status ? { label: "Post a job", href: "/employer/jobs/new" } : undefined}
              />
            }
            footer={
              result.pageCount > 1 ? (
                <Pagination pathname="/employer/jobs" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="jobs" />
              ) : undefined
            }
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
