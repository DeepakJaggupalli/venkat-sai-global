import type { Metadata } from "next";
import Link from "next/link";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listAssessmentCentres } from "@/modules/training/centres";
import { SKILL_ASSESSMENT_STATUSES, SKILL_ASSESSMENT_TYPE_LABELS } from "@/modules/training/constants";
import { listSkillAssessments } from "@/modules/training/skill-assessments";

import { isUuid, optionsFrom, pickEnum, staffTimeZone } from "../pipeline/_shared/server";
import { humanize, statusTone } from "../pipeline/_shared/status";

export const metadata: Metadata = { title: "Assessment centre" };

function parseDay(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["recruitment.assessments", "recruitment.view"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const status = pickEnum(sp(params, "status"), SKILL_ASSESSMENT_STATUSES);
  const centreParam = sp(params, "centre");
  const centreId = isUuid(centreParam) ? centreParam : undefined;
  const q = sp(params, "q")?.slice(0, 100);
  const [result, centres] = await Promise.all([
    listSkillAssessments(staff, { status, centreId, q, from: parseDay(sp(params, "from")), to: parseDay(sp(params, "to"), true) }, page),
    listAssessmentCentres(staff, { includeInactive: true }),
  ]);
  const tz = staffTimeZone(staff);
  const canSchedule = staffCan(staff, "recruitment.assessments");
  const centreOptions = centres.map((c) => ({ value: c.id, label: `${c.name}, ${c.city}` }));
  const statusOptions = optionsFrom(SKILL_ASSESSMENT_STATUSES);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessment centre"
        description="Venkat Sai trade, practical and theory assessments. Results are Venkat Sai assessments with their procedure reference, never accredited certifications."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Assessment centre" }]}
        actions={canSchedule ? [{ label: "Schedule assessments", href: "/admin/assessments/new" }] : undefined}
      />
      <LinkTabs
        label="Assessment centre sections"
        items={[
          { href: "/admin/assessments", label: "Assessments", match: "exact" },
          { href: "/admin/assessments/centres", label: "Centres", match: "prefix" },
        ]}
      />
      <FilterScope>
        <FilterBar paramKeys={["q", "status", "centre", "from", "to"]} search={<SearchInput label="Search by code or trade" />}>
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={statusOptions} />
          <FilterSelect param="centre" label="Centre" allLabel="All centres" options={centreOptions} />
          <DateRangeFilter label="Scheduled" />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "centre", label: "Centre", options: centreOptions },
            { param: "from", label: "From", kind: "date" },
            { param: "to", label: "To", kind: "date" },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Skill assessments"
            rows={result.items}
            getRowId={(a) => a.id}
            rowLink={(a) => ({ href: `/admin/assessments/${a.id}`, label: `Open assessment ${a.code}` })}
            columns={[
              {
                id: "candidate",
                header: "Candidate",
                primary: true,
                cell: (a) => (
                  <div>
                    <p className="font-medium">{a.candidateName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{a.code}</p>
                  </div>
                ),
              },
              {
                id: "trade",
                header: "Assessment",
                cell: (a) => (
                  <div>
                    <p>{a.trade}</p>
                    <p className="text-xs text-muted-foreground">
                      {SKILL_ASSESSMENT_TYPE_LABELS[a.assessmentType]}
                      {a.process ? ` · ${a.process}` : ""}
                      {a.position ? ` · ${a.position}` : ""}
                    </p>
                  </div>
                ),
              },
              { id: "when", header: "Scheduled", cell: (a) => <DateText value={a.scheduledAt} mode="datetime" timeZone={tz} /> },
              { id: "where", header: "Venue", hideOnMobile: true, cell: (a) => a.centreName ?? a.location ?? "—" },
              { id: "status", header: "Status", cell: (a) => <StatusBadge tone={statusTone(a.status)} size="sm">{humanize(a.status)}</StatusBadge> },
              {
                id: "result",
                header: "Result",
                cell: (a) =>
                  a.result === "pending" ? (
                    <span className="text-muted-foreground">Pending</span>
                  ) : (
                    <span className="inline-flex flex-col">
                      <StatusBadge tone={statusTone(a.result)} size="sm">{humanize(a.result)}</StatusBadge>
                      <span className="mt-1 text-xs text-muted-foreground">{a.resultPublishedAt ? "Published" : "Not published"}</span>
                    </span>
                  ),
              },
            ]}
            empty={
              <EmptyState
                title="No assessments found"
                description={status || centreId || q ? "Try different filters." : "Schedule trade tests for shortlisted candidates of a requirement, or from a candidate's profile."}
                primaryAction={canSchedule ? { label: "Schedule assessments", href: "/admin/assessments/new" } : undefined}
                secondaryAction={centres.length === 0 ? { label: "Add an assessment centre", href: "/admin/assessments/centres" } : undefined}
              />
            }
            footer={<Pagination pathname="/admin/assessments" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="assessments" />}
          />
        </FilterPendingRegion>
      </FilterScope>
      <p className="text-xs text-muted-foreground">
        Trade tests linked to a requirement or application are paid by the employer or Venkat Sai. Candidates are never charged. Public certificate checks:{" "}
        <Link href="/verify-certificate" className="underline underline-offset-4">
          /verify-certificate
        </Link>
        .
      </p>
    </div>
  );
}
