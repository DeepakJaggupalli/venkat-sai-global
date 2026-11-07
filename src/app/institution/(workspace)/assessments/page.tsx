import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import { ASSESSMENT_TYPE_LABELS } from "@/components/institution/labels";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";

import { oneOf, param, type SearchParams } from "../_lib/params";
import { listInstitutionAssessments } from "../_lib/queries";

export const metadata: Metadata = { title: "Assessments" };

export default async function InstitutionAssessmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", "institution.assessments.manage");
  const sp = await searchParams;
  const view = oneOf(param(sp, "view"), ["unpublished", "published"] as const);
  const result = await listInstitutionAssessments(ctx, { published: view === undefined ? undefined : view === "published" }, parsePage(sp));
  const timeZone = ctx.user.timezone ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments"
        description="Course tests, practicals, vivas and projects across your batches. Add assessments and enter scores from each batch."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Assessments" }]}
      />
      <Callout tone="neutral" title="Your assessments and Venkat Sai assessments">
        Scores you record here are your institution&apos;s course results. Venkat Sai trade and skill assessments are run by Venkat Sai separately, are labelled
        &quot;Venkat Sai assessment&quot;, and are never an external accreditation.
      </Callout>
      <LinkTabs
        label="Assessment views"
        items={[
          { href: "/institution/assessments", label: "All" },
          { href: "/institution/assessments?view=unpublished", label: "Results not published" },
          { href: "/institution/assessments?view=published", label: "Results published" },
        ]}
      />
      <DataTable
        caption="Course assessments"
        rows={result.items}
        getRowId={(a) => a.id}
        rowLink={(a) => ({ href: `/institution/batches/${a.batchId}?tab=assessments`, label: `Open ${a.title} in ${a.batchTitle}` })}
        columns={[
          {
            id: "title",
            header: "Assessment",
            primary: true,
            cell: (a) => (
              <span className="block min-w-0">
                <span className="block font-medium text-foreground">{a.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.courseTitle} · {a.batchTitle} ({a.batchCode})
                </span>
              </span>
            ),
          },
          { id: "type", header: "Type", hideOnMobile: true, cell: (a) => ASSESSMENT_TYPE_LABELS[a.type] ?? a.type },
          { id: "when", header: "Scheduled", hideOnMobile: true, cell: (a) => (a.scheduledAt ? <DateText value={a.scheduledAt} mode="datetime" timeZone={timeZone} /> : "Not set") },
          { id: "marks", header: "Marked", align: "right", cell: (a) => a.scored },
          {
            id: "status",
            header: "Results",
            cell: (a) => (
              <StatusBadge tone={a.resultsPublishedAt ? "success" : "neutral"} size="sm">
                {a.resultsPublishedAt ? "Published" : "Not published"}
              </StatusBadge>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={<ClipboardCheck aria-hidden="true" />}
            title={view ? "Nothing in this view" : "No assessments yet"}
            description="Open a batch and add its assessments on the Assessments and results tab."
            primaryAction={{ label: "View batches", href: "/institution/batches" }}
          />
        }
        footer={<Pagination pathname="/institution/assessments" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="assessments" />}
      />
    </div>
  );
}
