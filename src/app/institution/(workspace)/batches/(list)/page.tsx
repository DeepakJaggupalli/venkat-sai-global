import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";

import { BATCH_STATUS_LABELS, batchStatus, COURSE_MODE_LABELS } from "@/components/institution/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterScope, FilterSelect } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { BATCH_STATUSES } from "@/modules/training/constants";
import { listBatches } from "@/modules/training/queries";

import { oneOf, param, uuidParam, type SearchParams } from "../../_lib/params";
import { listCourseOptions } from "../../_lib/queries";

export const metadata: Metadata = { title: "Batches" };

export default async function InstitutionBatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", ["institution.batches.manage", "institution.students.manage", "institution.assessments.manage"], "any");
  const sp = await searchParams;
  const status = oneOf(param(sp, "status"), BATCH_STATUSES);
  const courseId = uuidParam(param(sp, "course"));
  const canManage = ctx.permissions.has("institution.batches.manage");
  const [result, courses] = await Promise.all([listBatches(ctx, { status, courseId }, parsePage(sp)), canManage ? listCourseOptions(ctx) : Promise.resolve([])]);

  const tabs = [
    { href: "/institution/batches", label: "All" },
    ...BATCH_STATUSES.map((s) => ({ href: `/institution/batches?status=${s}`, label: BATCH_STATUS_LABELS[s] })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description={canManage ? "Scheduled runs of your courses: dates, seats, instructors and status." : "Batches you are assigned to as an instructor."}
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Batches" }]}
        actions={canManage ? [{ label: "Schedule a batch", href: "/institution/batches/new" }] : undefined}
      />
      <LinkTabs label="Batch status" items={tabs} />
      <FilterScope>
        {courses.length ? (
          <FilterBar paramKeys={["course"]}>
            <FilterSelect param="course" label="Course" allLabel="All courses" options={courses.map((c) => ({ value: c.value, label: c.label }))} />
          </FilterBar>
        ) : null}
        <DataTable
          caption="Batches"
          rows={result.items}
          getRowId={(b) => b.id}
          rowLink={(b) => ({ href: `/institution/batches/${b.id}`, label: `Open batch ${b.title}` })}
          columns={[
            {
              id: "title",
              header: "Batch",
              primary: true,
              cell: (b) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{b.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.courseTitle} · {b.code}
                  </span>
                </span>
              ),
            },
            {
              id: "dates",
              header: "Dates",
              cell: (b) =>
                b.startsOn ? (
                  <span>
                    <DateText value={b.startsOn} dateOnly />
                    {b.endsOn ? (
                      <>
                        {" to "}
                        <DateText value={b.endsOn} dateOnly />
                      </>
                    ) : null}
                  </span>
                ) : (
                  "Not set"
                ),
            },
            { id: "mode", header: "Delivery", hideOnMobile: true, cell: (b) => [COURSE_MODE_LABELS[b.mode], b.city].filter(Boolean).join(" · ") },
            { id: "seats", header: "Seats", align: "right", cell: (b) => (b.capacity ? `${b.enrolledCount} / ${b.capacity}` : `${b.enrolledCount}`) },
            {
              id: "status",
              header: "Status",
              cell: (b) => (
                <StatusBadge tone={batchStatus(b.status).tone} size="sm">
                  {batchStatus(b.status).label}
                </StatusBadge>
              ),
            },
          ]}
          empty={
            status || courseId ? (
              <EmptyState title="No batches match" description="Try another status or course." primaryAction={{ label: "Clear filters", href: "/institution/batches", variant: "outline" }} />
            ) : (
              <EmptyState
                icon={<CalendarClock aria-hidden="true" />}
                title={canManage ? "No batches yet" : "No batches assigned to you"}
                description={
                  canManage
                    ? "Schedule a batch of one of your courses, then open it for enrolment once the course is published."
                    : "When a coordinator adds you as an instructor, the batch appears here."
                }
                primaryAction={canManage ? { label: "Schedule a batch", href: "/institution/batches/new" } : undefined}
              />
            )
          }
          footer={<Pagination pathname="/institution/batches" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="batches" />}
        />
      </FilterScope>
    </div>
  );
}
