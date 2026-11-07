import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { COURSE_CERTIFICATION_TYPE_LABELS, COURSE_FEE_TYPE_LABELS, courseStatus } from "@/components/institution/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterScope, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { COURSE_STATUSES } from "@/modules/training/constants";
import { listCourses } from "@/modules/training/queries";

import { oneOf, param, type SearchParams } from "../../_lib/params";

export const metadata: Metadata = { title: "Courses" };

export default async function InstitutionCoursesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", "institution.courses.manage");
  const sp = await searchParams;
  const status = oneOf(param(sp, "status"), COURSE_STATUSES);
  const q = param(sp, "q")?.slice(0, 100);
  const result = await listCourses(ctx, { status, q }, parsePage(sp));
  const filtered = Boolean(status || q);

  const tabs = [
    { href: "/institution/courses", label: "All" },
    { href: "/institution/courses?status=draft", label: "Drafts" },
    { href: "/institution/courses?status=pending_approval", label: "In review" },
    { href: "/institution/courses?status=changes_requested", label: "Changes requested" },
    { href: "/institution/courses?status=published", label: "Published" },
    { href: "/institution/courses?status=archived", label: "Archived" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description="Your course catalogue: syllabus, fees, eligibility and what learners can earn. Courses are published after Venkat Sai reviews them."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Courses" }]}
        actions={[{ label: "New course", href: "/institution/courses/new" }]}
      />
      <LinkTabs label="Course status" items={tabs} />
      <FilterScope>
        <FilterBar paramKeys={["q"]} search={<SearchInput label="Search courses by title or code" />} />
        <DataTable
          caption="Courses"
          rows={result.items}
          getRowId={(c) => c.id}
          rowLink={(c) => ({ href: `/institution/courses/${c.id}`, label: `Open ${c.title}` })}
          columns={[
            {
              id: "title",
              header: "Course",
              primary: true,
              cell: (c) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{c.title}</span>
                  <span className="block text-xs text-muted-foreground">{c.code}</span>
                </span>
              ),
            },
            {
              id: "status",
              header: "Status",
              cell: (c) => (
                <StatusBadge tone={courseStatus(c.status).tone} size="sm">
                  {courseStatus(c.status).label}
                </StatusBadge>
              ),
            },
            { id: "certification", header: "Certification", hideOnMobile: true, cell: (c) => COURSE_CERTIFICATION_TYPE_LABELS[c.certificationType] },
            {
              id: "fee",
              header: "Fee",
              cell: (c) => (c.feeType === "fixed" ? <MoneyText amountMinor={c.feeMinor} currency={c.feeCurrency} /> : COURSE_FEE_TYPE_LABELS[c.feeType]),
            },
            { id: "batches", header: "Batches", align: "right", cell: (c) => c.batchCount },
            { id: "updated", header: "Updated", hideOnMobile: true, cell: (c) => <DateText value={c.updatedAt} timeZone={ctx.user.timezone ?? undefined} /> },
          ]}
          empty={
            filtered ? (
              <EmptyState title="No courses match" description="Try another status or search term." primaryAction={{ label: "Clear filters", href: "/institution/courses", variant: "outline" }} />
            ) : (
              <EmptyState
                icon={<BookOpen aria-hidden="true" />}
                title="No courses yet"
                description="Create a course with its syllabus, fee and certification, then submit it for publication."
                primaryAction={{ label: "New course", href: "/institution/courses/new" }}
              />
            )
          }
          footer={
            <Pagination pathname="/institution/courses" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="courses" />
          }
        />
      </FilterScope>
    </div>
  );
}
