import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquare } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { getEmployerPipelineOverview } from "@/modules/recruitment/queries";
import type { EmployerPipelineOverview } from "@/modules/recruitment/types";
import { PIPELINE_COLUMNS } from "@/modules/recruitment/workflow";

export const metadata: Metadata = { title: "Pipeline" };

type JobRow = EmployerPipelineOverview["jobs"][number];

/** Columns shown in the overview table (the rest are summed into "Later stages"). */
const MAIN_COLUMNS = ["screening", "shortlisted", "trade_test", "client_interview", "selected", "offer"] as const;

export default async function PipelineOverviewPage() {
  const ctx = await requireOrgMember("employer", "employer.pipeline.view");
  const overview = await getEmployerPipelineOverview(ctx);
  const requirementCount = overview.requirementColumns.reduce((n, c) => n + c.requirements.length, 0);
  const label = (key: string) => PIPELINE_COLUMNS.find((c) => c.key === key)?.label ?? key;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Every job's candidates by stage, and workforce requirements on their way to sourcing."
        actions={orgCan(ctx, "employer.jobs.manage") ? [{ label: "Post a job", href: "/employer/jobs/new" }] : undefined}
      />

      {requirementCount > 0 ? (
        <SectionCard title="Workforce requirements" description="Requirements become jobs and candidates once Venkat Sai approves and starts sourcing.">
          <div className="grid gap-4 md:grid-cols-3">
            {overview.requirementColumns.map((col) => (
              <section key={col.key} aria-labelledby={`req-${col.key}`} className="rounded-lg bg-surface-subtle p-3">
                <h3 id={`req-${col.key}`} className="mb-2 flex items-center justify-between font-heading text-sm font-semibold">
                  {col.label} <span className="text-xs font-normal text-muted-foreground">{col.requirements.length}</span>
                </h3>
                {col.requirements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-2">
                    {col.requirements.map((r) => (
                      <li key={r.id} className="rounded-md border bg-card p-2.5 text-sm">
                        <Link href={`/employer/requirements/${r.id}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
                          {r.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {r.code} · {r.totalPositions} {r.totalPositions === 1 ? "position" : "positions"} · <DateText value={r.createdAt} />
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Jobs" flush description="Open a job to manage its candidates on the board.">
        <DataTable<JobRow>
          caption="Candidates per job and stage"
          rows={overview.jobs}
          getRowId={(j) => j.id}
          rowLink={(j) => ({ href: `/employer/pipeline/${j.id}`, label: `Open pipeline for ${j.title}` })}
          columns={[
            {
              id: "job",
              header: "Job",
              primary: true,
              cell: (j) => (
                <div className="min-w-0">
                  <p className="font-medium">{j.title}</p>
                  <p className="text-xs text-muted-foreground">{j.code}</p>
                </div>
              ),
            },
            { id: "status", header: "Status", cell: (j) => <StatusBadge status={j.status} domain="job" size="sm" /> },
            { id: "total", header: "Candidates", align: "right", cell: (j) => j.total },
            ...MAIN_COLUMNS.map((key) => ({ id: key, header: label(key), align: "right" as const, hideOnMobile: true, cell: (j: JobRow) => j.counts[key] || "–" })),
            {
              id: "later",
              header: "Later stages",
              align: "right",
              hideOnMobile: true,
              cell: (j) => j.counts.documentation + j.counts.mobilisation + j.counts.joined || "–",
            },
          ]}
          empty={
            <EmptyState
              icon={<KanbanSquare aria-hidden />}
              title="No published jobs yet"
              description="Once a job is published, its applications appear here by stage."
              primaryAction={orgCan(ctx, "employer.jobs.manage") ? { label: "Post a job", href: "/employer/jobs/new" } : undefined}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
