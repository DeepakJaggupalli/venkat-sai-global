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
import { BATCH_STATUSES, BATCH_STATUS_LABELS, COURSE_MODE_LABELS } from "@/modules/training/constants";
import { listBatches } from "@/modules/training/queries";

import { optionsFrom, pickEnum } from "../../pipeline/_shared/server";
import { statusTone } from "../../pipeline/_shared/status";
import { TrainingTabs } from "../_components/training-tabs";

export const metadata: Metadata = { title: "Batches · Training" };

export default async function TrainingBatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff(["training.view", "training.manage"], "any");
  const params = await searchParams;
  const page = parsePage(params);
  const status = pickEnum(sp(params, "status"), BATCH_STATUSES);
  const provider = sp(params, "provider") === "venkat_sai" ? ("venkat_sai" as const) : undefined;
  const result = await listBatches(staff, { status, organizationId: provider }, page);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description="Every scheduled batch across Venkat Sai and institutions. Open a batch to manage enrolments."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Training", href: "/admin/training" }, { label: "Batches" }]}
      />
      <TrainingTabs />
      <FilterScope>
        <FilterBar paramKeys={["status", "provider"]}>
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={optionsFrom(BATCH_STATUSES, BATCH_STATUS_LABELS)} />
          <FilterSelect param="provider" label="Provider" allLabel="All providers" options={[{ value: "venkat_sai", label: "Venkat Sai only" }]} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Batches"
            rows={result.items}
            getRowId={(b) => b.id}
            rowLink={(b) => ({ href: `/admin/training/batches/${b.id}`, label: `Open batch ${b.title}` })}
            columns={[
              {
                id: "title",
                header: "Batch",
                primary: true,
                cell: (b) => (
                  <div>
                    <p className="font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.courseTitle} · <span className="font-mono">{b.code}</span>
                    </p>
                  </div>
                ),
              },
              { id: "provider", header: "Provider", hideOnMobile: true, cell: (b) => (b.organizationId ? "Institution" : "Venkat Sai") },
              { id: "mode", header: "Delivery", hideOnMobile: true, cell: (b) => COURSE_MODE_LABELS[b.mode] },
              { id: "starts", header: "Starts", cell: (b) => (b.startsOn ? <DateText value={b.startsOn} dateOnly /> : "—") },
              { id: "seats", header: "Seats", align: "right", cell: (b) => (b.capacity ? `${b.enrolledCount} / ${b.capacity}` : `${b.enrolledCount}`) },
              { id: "status", header: "Status", cell: (b) => <StatusBadge tone={statusTone(b.status)} size="sm">{BATCH_STATUS_LABELS[b.status]}</StatusBadge> },
            ]}
            empty={<EmptyState title="No batches found" description={status || provider ? "Try different filters." : "Batches are scheduled from a course page."} primaryAction={{ label: "Browse courses", href: "/admin/training/courses" }} />}
            footer={<Pagination pathname="/admin/training/batches" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="batches" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
