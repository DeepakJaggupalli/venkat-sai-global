import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";

import { ExportLink } from "@/components/employer-talent/export-link";
import { FUNNEL_STEPS } from "@/components/employer-talent/report-utils";
import { BarChart } from "@/components/shared/charts";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar, FilterSelect } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SearchParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";

import { buildReport, type JobReportRow } from "./_lib/model";
import { loadReportData, parseReportFilters, reportJobOptions } from "./_lib/queries";

export const metadata: Metadata = { title: "Recruitment reports" };

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 1000) / 10}%`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", "employer.reports.view");
  const sp = await searchParams;
  const filters = parseReportFilters(sp);
  const [data, jobOptions] = await Promise.all([loadReportData(ctx, filters), reportJobOptions(ctx)]);
  const model = buildReport(data);

  const query = new URLSearchParams();
  if (filters.fromIso) query.set("from", filters.fromIso);
  if (filters.toIso) query.set("to", filters.toIso);
  if (filters.jobId) query.set("jobId", filters.jobId);
  const exportHref = (report: string) => `/employer/reports/export?${new URLSearchParams({ ...Object.fromEntries(query), report }).toString()}`;
  const hasActivity = model.totals.applied > 0 || model.interviewTotal > 0 || model.timeToHire.hires > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment reports"
        description="Live figures from your own jobs and the applications shared with you. Dates filter by application, interview or placement date."
        breadcrumbs={[{ label: "Employer", href: "/employer" }, { label: "Reports" }]}
        actions={<ExportLink href={exportHref("jobs")} label="Export jobs CSV" report="jobs" />}
      />
      <FilterBar paramKeys={["from", "to", "jobId"]}>
        <DateRangeFilter label="Period" emptyLabel="All time" />
        {jobOptions.length ? <FilterSelect param="jobId" label="Job" options={jobOptions} allLabel="All jobs" /> : null}
      </FilterBar>

      {!hasActivity ? (
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title="No recruitment activity in this period"
          description="Reports fill in as candidates apply, interviews take place and people join. Try a wider period, or post a job to get started."
          primaryAction={{ label: "Post a job", href: "/employer/jobs/new" }}
          secondaryAction={filters.fromIso || filters.toIso || filters.jobId ? { label: "Clear filters", href: "/employer/reports" } : undefined}
        />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard label="Applications" value={model.totals.applied} hint="Shared with your organisation" />
            <StatCard label="Joined" value={model.totals.joined} hint={`Applied to joined: ${percent(model.totals.applied ? model.totals.joined / model.totals.applied : null)}`} />
            <StatCard label="Median time to fill" value={model.timeToFill.median} unit="days" hint={model.timeToFill.filledJobs ? `Publish to first hire, ${model.timeToFill.filledJobs} ${model.timeToFill.filledJobs === 1 ? "job" : "jobs"}` : "No filled jobs yet"} />
            <StatCard label="Median time to hire" value={model.timeToHire.median} unit="days" hint={model.timeToHire.hires ? `Application to offer accepted, ${model.timeToHire.hires} ${model.timeToHire.hires === 1 ? "hire" : "hires"}` : "No hires yet"} />
          </StatGrid>

          <SectionCard title="Hiring funnel" description="How many applications reached each step (an application counts once at every step it passed).">
            <BarChart
              title="Hiring funnel"
              index="step"
              indexLabel="Step"
              orientation="horizontal"
              data={FUNNEL_STEPS.map((s) => ({ step: s.label, applications: model.totals[s.key] }))}
              series={[{ key: "applications", label: "Applications" }]}
            />
          </SectionCard>

          <SectionCard title="Funnel by job" flush action={<ExportLink href={exportHref("jobs")} label="CSV" report="jobs" />}>
            <DataTable<JobReportRow>
              caption="Funnel conversion and time to fill per job"
              rows={model.rows}
              getRowId={(r) => r.job.id}
              rowLink={(r) => ({ href: `/employer/pipeline/${r.job.id}`, label: `Open pipeline for ${r.job.title}` })}
              columns={[
                {
                  id: "job",
                  header: "Job",
                  primary: true,
                  cell: (r) => (
                    <div className="min-w-0">
                      <p className="font-medium">{r.job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.job.code} · {r.job.openings} {r.job.openings === 1 ? "opening" : "openings"}
                      </p>
                    </div>
                  ),
                },
                { id: "status", header: "Status", hideOnMobile: true, cell: (r) => <StatusBadge status={r.job.status} domain="job" size="sm" /> },
                ...FUNNEL_STEPS.map((s) => ({ id: s.key, header: s.label, align: "right" as const, cell: (r: JobReportRow) => r.counts[s.key] })),
                { id: "conversion", header: "Applied → joined", align: "right", cell: (r) => percent(r.conversion) },
                { id: "ttf", header: "Days to first hire", align: "right", cell: (r) => r.timeToFillDays ?? "—" },
              ]}
              empty={<EmptyState title="No published jobs" description="Publish a job to see its funnel." />}
            />
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Source of hire" description="Hires from recruitment partners are counted under Venkat Sai." action={<ExportLink href={exportHref("sources")} label="CSV" report="sources" />}>
              <BarChart
                title="Hires by source"
                index="source"
                indexLabel="Source"
                orientation="horizontal"
                data={model.sources.map((s) => ({ source: s.label, hires: s.value }))}
                series={[{ key: "hires", label: "Hires" }]}
                emptyText="No hires in this period."
              />
            </SectionCard>
            <SectionCard title="Interview outcomes" description={`${model.interviewTotal} ${model.interviewTotal === 1 ? "interview" : "interviews"} in this period.`} action={<ExportLink href={exportHref("interviews")} label="CSV" report="interviews" />}>
              <BarChart
                title="Interviews by status"
                index="status"
                indexLabel="Status"
                orientation="horizontal"
                data={model.interviewStatus.map((s) => ({ status: s.label, interviews: s.value }))}
                series={[{ key: "interviews", label: "Interviews" }]}
                size="sm"
              />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 font-heading text-sm font-semibold">Completed interviews</h3>
                  <ul className="space-y-0.5 text-sm">
                    {model.interviewOutcomes.map((o) => (
                      <li key={o.key} className="flex justify-between gap-2">
                        <span>{o.label}</span>
                        <span className="tabular-nums">{o.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 font-heading text-sm font-semibold">Your team&apos;s recommendations</h3>
                  <ul className="space-y-0.5 text-sm">
                    {model.recommendations.map((o) => (
                      <li key={o.key} className="flex justify-between gap-2">
                        <span>{o.label}</span>
                        <span className="tabular-nums">{o.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
