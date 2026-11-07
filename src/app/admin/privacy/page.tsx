import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { env } from "@/lib/env";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { DATA_REQUEST_TYPE_LABELS, DATA_REQUEST_TYPE_VALUES } from "@/modules/privacy/constants";
import { dataRequestCounts, listDataRequests } from "@/modules/privacy/queries";
import { staffDataRequestFiltersSchema, type StaffDataRequestFilters } from "@/modules/privacy/schemas";

import { DataRequestStatusBadge, DataRequestSlaBadge } from "./_components/badges";

export const metadata: Metadata = { title: "Privacy requests" };

const BASE = "/admin/privacy";

const QUEUES: Record<string, { label: string; filters: Partial<StaffDataRequestFilters> }> = {
  open: { label: "All open", filters: { status: "open" } },
  mine: { label: "Assigned to me", filters: { status: "open", assigned: "me" } },
  unassigned: { label: "Unassigned", filters: { status: "open", assigned: "unassigned" } },
  overdue: { label: "Overdue", filters: { sla: "overdue" } },
  due_soon: { label: "Due soon", filters: { sla: "due_soon" } },
  identity: { label: "Verifying identity", filters: { status: "identity_verification" } },
  closed: { label: "Closed", filters: { status: "closed" } },
};

/** Data principal requests (DPDP Act 2023): access, export, correction, deletion and more, with deadlines from settings. */
export default async function PrivacyRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("privacy.requests");
  const sp = await searchParams;
  const queueKey = typeof sp.queue === "string" && sp.queue in QUEUES ? sp.queue : "open";
  const extra = staffDataRequestFiltersSchema.parse({ type: sp.type, q: sp.q });
  const filters: StaffDataRequestFilters = { ...QUEUES[queueKey]!.filters, ...extra };
  const page = parsePage(sp, { defaultSize: 25, maxSize: 100 });
  const [result, counts] = await Promise.all([listDataRequests(ctx, filters, page), dataRequestCounts(ctx)]);
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const href = (key: string) => (key === "open" ? BASE : `${BASE}?queue=${key}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Privacy requests" description="Requests from people to access, export, correct or delete their personal data. Deadlines follow the data request setting." />
      <StatGrid columns={4}>
        <StatCard label="Open" value={counts.open} href={BASE} />
        <StatCard label="Overdue" value={counts.overdue} href={href("overdue")} />
        <StatCard label="Due within 3 days" value={counts.dueSoon} href={href("due_soon")} />
        <StatCard label="Verifying identity" value={counts.awaitingIdentity} href={href("identity")} />
      </StatGrid>
      <LinkTabs label="Queues" items={Object.entries(QUEUES).map(([key, q]) => ({ href: href(key), label: q.label }))} activeHref={href(queueKey)} />
      <FilterScope>
        <FilterBar paramKeys={["q", "type"]} search={<SearchInput label="Search requests" placeholder="Code, name or email" />}>
          <FilterSelect param="type" label="Type" allLabel="All types" options={DATA_REQUEST_TYPE_VALUES.map((v) => ({ value: v, label: DATA_REQUEST_TYPE_LABELS[v] }))} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Privacy requests"
            rows={result.items}
            getRowId={(r) => r.id}
            rowLink={(r) => ({ href: `${BASE}/${r.id}`, label: `Open request ${r.code}` })}
            columns={[
              {
                id: "request",
                header: "Request",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{DATA_REQUEST_TYPE_LABELS[r.type]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.code} · {r.requesterName ?? "Unknown"}
                      {r.hasAccount ? "" : " · no account"}
                    </p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (r) => <DataRequestStatusBadge status={r.status} /> },
              {
                id: "due",
                header: "Due",
                cell: (r) => (
                  <span className="flex flex-col gap-1">
                    <DataRequestSlaBadge status={r.status} dueAt={r.dueAt} />
                    {r.dueAt ? <DateText value={r.dueAt} timeZone={timeZone} className="text-xs text-muted-foreground" /> : null}
                  </span>
                ),
              },
              { id: "identity", header: "Identity", hideOnMobile: true, cell: (r) => (r.identityVerifiedAt ? "Verified" : "Not verified") },
              { id: "handler", header: "Handled by", hideOnMobile: true, cell: (r) => r.handlerName ?? "Unassigned" },
              { id: "received", header: "Received", hideOnMobile: true, nowrap: true, cell: (r) => <DateText value={r.createdAt} timeZone={timeZone} /> },
            ]}
            empty={<EmptyState title="No requests in this queue" description="New data requests appear here as they arrive." />}
            footer={<Pagination pathname={BASE} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requests" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
