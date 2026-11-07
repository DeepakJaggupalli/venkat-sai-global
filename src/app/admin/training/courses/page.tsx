import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { COURSE_CATEGORY_LABELS, COURSE_STATUSES } from "@/modules/training/constants";
import { listCourses } from "@/modules/training/queries";

import { optionsFrom, pickEnum, staffTimeZone } from "../../pipeline/_shared/server";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { TrainingTabs } from "../_components/training-tabs";

export const metadata: Metadata = { title: "Courses · Training" };

// The module filters by one provider (Venkat Sai or a single institution); "all" covers institutions.
const PROVIDERS = [{ value: "venkat_sai", label: "Venkat Sai only" }];

export default async function TrainingCoursesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["training.view", "training.manage"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const status = pickEnum(sp(params, "status"), COURSE_STATUSES);
  const provider = sp(params, "provider");
  const q = sp(params, "q")?.slice(0, 100);
  const result = await listCourses(staff, { status, q, organizationId: provider === "venkat_sai" ? "venkat_sai" : undefined }, page);
  const rows = result.items;
  const tz = staffTimeZone(staff);
  const canManage = staffCan(staff, "training.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description="Every course on the platform. Venkat Sai courses publish directly; institution courses are reviewed in the approval centre."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Training", href: "/admin/training" }, { label: "Courses" }]}
        actions={canManage ? [{ label: "New Venkat Sai course", href: "/admin/training/courses/new" }] : undefined}
      />
      <TrainingTabs />
      <FilterScope>
        <FilterBar paramKeys={["q", "status", "provider"]} search={<SearchInput label="Search by title or code" />}>
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={optionsFrom(COURSE_STATUSES)} />
          <FilterSelect param="provider" label="Provider" allLabel="All providers" options={PROVIDERS} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Courses"
            rows={rows}
            getRowId={(c) => c.id}
            rowLink={(c) => ({ href: `/admin/training/courses/${c.id}`, label: `Open ${c.title}` })}
            columns={[
              { id: "title", header: "Course", primary: true, cell: (c) => (<div><p className="font-medium">{c.title}</p><p className="font-mono text-xs text-muted-foreground">{c.code}</p></div>) },
              { id: "provider", header: "Provider", cell: (c) => (c.organizationId ? "Institution" : "Venkat Sai") },
              { id: "category", header: "Category", hideOnMobile: true, cell: (c) => COURSE_CATEGORY_LABELS[c.category] },
              { id: "batches", header: "Batches", align: "right", cell: (c) => c.batchCount },
              { id: "status", header: "Status", cell: (c) => <StatusBadge tone={statusTone(c.status)} size="sm">{humanize(c.status)}</StatusBadge> },
              { id: "updated", header: "Updated", hideOnMobile: true, cell: (c) => <DateText value={c.updatedAt} timeZone={tz} /> },
            ]}
            empty={<EmptyState title="No courses found" description={q || status || provider ? "Try different filters." : "Courses created by Venkat Sai or institutions will appear here."} primaryAction={canManage ? { label: "Create a course", href: "/admin/training/courses/new" } : undefined} />}
            footer={<Pagination pathname="/admin/training/courses" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="courses" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
