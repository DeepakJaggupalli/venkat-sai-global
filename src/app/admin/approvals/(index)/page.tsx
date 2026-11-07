import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { PriorityBadge } from "@/components/admin/priority-badge";
import { listStaffOptions } from "@/components/admin/queries";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { APPROVAL_STATUSES, APPROVAL_TYPES } from "@/db/schema";
import { humanize } from "@/lib/format";
import { parsePage } from "@/lib/http";
import { APPROVAL_TYPE_LABEL } from "@/modules/approvals/registry";
import { requireStaff } from "@/modules/identity/authz";

import { approvalFiltersSchema, listApprovalInbox, openApprovalCountsByType } from "../_lib/queries";

export const metadata: Metadata = { title: "Approval centre" };

type SP = Record<string, string | string[] | undefined>;

const typeOptions = APPROVAL_TYPES.map((t) => ({ value: t, label: APPROVAL_TYPE_LABEL[t] }));
const statusOptions = [{ value: "all", label: "Any status" }, ...APPROVAL_STATUSES.map((s) => ({ value: s, label: humanize(s) }))];
const priorityOptions = ["urgent", "high", "normal", "low"].map((p) => ({ value: p, label: humanize(p) }));

export default async function ApprovalCentrePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("approvals.view");
  const sp = await searchParams;
  const filters = approvalFiltersSchema.parse({
    status: typeof sp.status === "string" ? sp.status : undefined,
    type: sp.type,
    priority: sp.priority,
    assignee: sp.assignee,
    q: sp.q,
  });
  const page = parsePage(sp, { defaultSize: 25 });
  const [result, staff, openByType] = await Promise.all([listApprovalInbox(ctx, filters, page), listStaffOptions({ permission: "approvals.view" }), openApprovalCountsByType()]);
  const openTotal = openByType.reduce((a, r) => a + r.value, 0);
  const assigneeOptions = [{ value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }, ...staff];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval centre"
        description="Every verification, publication and exception request in one inbox. Open the request to review the submitted snapshot and decide."
        meta={<span className="text-sm text-muted-foreground">{openTotal === 1 ? "1 request awaiting a decision" : `${openTotal} requests awaiting a decision`}</span>}
      />

      <LinkTabs
        label="Approval views"
        items={[
          { href: "/admin/approvals", label: "Open" },
          { href: "/admin/approvals?assignee=me", label: "Assigned to me" },
          { href: "/admin/approvals?assignee=unassigned", label: "Unassigned" },
          { href: "/admin/approvals?status=all", label: "All requests" },
        ]}
      />

      <FilterScope>
        <FilterBar paramKeys={["q", "type", "status", "priority", "assignee"]} search={<SearchInput label="Search by title or code" />}>
          <FilterSelect param="type" label="Type" allLabel="All types" options={typeOptions} />
          <FilterSelect param="status" label="Status" allLabel="Open" options={statusOptions} />
          <FilterSelect param="priority" label="Priority" allLabel="Any priority" options={priorityOptions} />
          <FilterSelect param="assignee" label="Assignee" allLabel="Anyone" options={assigneeOptions} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "type", label: "Type", options: typeOptions },
            { param: "status", label: "Status", options: statusOptions },
            { param: "priority", label: "Priority", options: priorityOptions },
            { param: "assignee", label: "Assignee", options: assigneeOptions },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Approval requests"
            rows={result.items}
            getRowId={(r) => r.id}
            rowLink={(r) => ({ href: `/admin/approvals/${r.id}`, label: `Open ${r.code}: ${r.title}` })}
            columns={[
              {
                id: "title",
                header: "Request",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.code} · {APPROVAL_TYPE_LABEL[r.type]}
                      {r.organizationName ? ` · ${r.organizationName}` : ""}
                    </p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} domain="approval" size="sm" /> },
              { id: "priority", header: "Priority", cell: (r) => <PriorityBadge priority={r.priority} /> },
              { id: "assignee", header: "Assignee", hideOnMobile: true, cell: (r) => r.assigneeName ?? <span className="text-muted-foreground">Unassigned</span> },
              { id: "submitted", header: "Submitted", nowrap: true, cell: (r) => <RelativeTime value={r.createdAt} /> },
            ]}
            empty={
              <EmptyState
                icon={<ListChecks />}
                title={filters.status === "open" && !filters.q && !filters.type ? "Nothing waiting for a decision" : "No requests match these filters"}
                description="New verification, job and content requests appear here as soon as they are submitted."
                primaryAction={filters.q || filters.type || filters.priority || filters.assignee ? { label: "Clear filters", href: "/admin/approvals", variant: "outline" } : undefined}
              />
            }
            footer={
              <Pagination
                pathname="/admin/approvals"
                searchParams={sp}
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                pageSize={result.pageSize}
                itemLabel="requests"
              />
            }
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
