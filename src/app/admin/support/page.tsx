import type { Metadata } from "next";
import { z } from "zod";

import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { TICKET_CATEGORY_LABELS, TICKET_CATEGORY_VALUES, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_VALUES, TICKET_STATUS_LABELS, TICKET_STATUS_VALUES } from "@/modules/operations/constants";
import { listTickets, ticketQueueCounts, type TicketListFilters } from "@/modules/operations/queries";

import { SlaBadge } from "./_components/sla-badge";

export const metadata: Metadata = { title: "Support desk" };

const BASE = "/admin/support";

const QUEUES = {
  open: { label: "All open", filters: { status: "open" } },
  mine: { label: "Assigned to me", filters: { status: "open", assignedTo: "me" } },
  unassigned: { label: "Unassigned", filters: { status: "open", assignedTo: "unassigned" } },
  breached: { label: "Missed deadline", filters: { status: "open", breached: true } },
  grievances: { label: "Grievances", filters: { status: "open", grievance: true } },
  closed: { label: "Resolved and closed", filters: { status: "closed" } },
} as const satisfies Record<string, { label: string; filters: TicketListFilters }>;

const searchSchema = z.object({
  queue: z.enum(Object.keys(QUEUES) as [keyof typeof QUEUES, ...(keyof typeof QUEUES)[]]).catch("open").default("open"),
  q: z.string().trim().max(120).optional().catch(undefined),
  category: z.enum(TICKET_CATEGORY_VALUES).optional().catch(undefined),
  priority: z.enum(TICKET_PRIORITY_VALUES).optional().catch(undefined),
  status: z.enum(TICKET_STATUS_VALUES).optional().catch(undefined),
});

export default async function SupportDeskPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("support.view");
  const sp = await searchParams;
  const parsed = searchSchema.parse(sp);
  const page = parsePage(sp, { defaultSize: 25, maxSize: 100 });
  const queue = QUEUES[parsed.queue];
  const filters: TicketListFilters = { ...queue.filters, q: parsed.q, category: parsed.category, priority: parsed.priority, ...(parsed.status ? { status: parsed.status } : {}) };
  const [result, counts] = await Promise.all([listTickets(ctx, filters, page), ticketQueueCounts(ctx)]);
  const canGrievances = staffCan(ctx, "support.grievances");

  const queueHref = (key: string) => (key === "open" ? BASE : `${BASE}?queue=${key}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support desk"
        description="Requests from candidates, employers, partners and institutions, with response deadlines from the support settings."
        actions={[
          ...(staffCan(ctx, "support.manage") ? [{ label: "Log a request", href: `${BASE}/new` }] : []),
          ...(canGrievances ? [{ label: "Grievance register", href: `${BASE}/grievances`, variant: "outline" as const }] : []),
        ]}
      />
      <StatGrid columns={4}>
        <StatCard label="Open" value={counts.open} href={BASE} />
        <StatCard label="Unassigned" value={counts.unassigned} href={queueHref("unassigned")} />
        <StatCard label="Assigned to me" value={counts.mine} href={queueHref("mine")} />
        <StatCard label="Missed a deadline" value={counts.breached} href={queueHref("breached")} />
      </StatGrid>
      <LinkTabs
        label="Queues"
        items={Object.entries(QUEUES)
          .filter(([key]) => key !== "grievances" || canGrievances)
          .map(([key, q]) => ({ href: queueHref(key), label: q.label, count: key === "grievances" ? counts.grievances : undefined }))}
        activeHref={queueHref(parsed.queue)}
      />
      <FilterScope>
        <FilterBar paramKeys={["q", "category", "priority", "status"]} search={<SearchInput label="Search requests" placeholder="Code, subject or requester" />}>
          <FilterSelect param="category" label="Category" allLabel="All categories" options={TICKET_CATEGORY_VALUES.map((v) => ({ value: v, label: TICKET_CATEGORY_LABELS[v] }))} />
          <FilterSelect param="priority" label="Priority" allLabel="All priorities" options={TICKET_PRIORITY_VALUES.map((v) => ({ value: v, label: TICKET_PRIORITY_LABELS[v] }))} />
          <FilterSelect param="status" label="Status" allLabel="Any status in queue" options={TICKET_STATUS_VALUES.map((v) => ({ value: v, label: TICKET_STATUS_LABELS[v] }))} />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Support requests"
            rows={result.items}
            getRowId={(t) => t.id}
            rowLink={(t) => ({ href: `${BASE}/${t.id}`, label: `Open request ${t.code}` })}
            columns={[
              {
                id: "request",
                header: "Request",
                primary: true,
                cell: (t) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.code}
                      {t.grievanceCode ? ` · ${t.grievanceCode}` : ""} · {t.requesterName ?? "Unknown requester"}
                    </p>
                  </div>
                ),
              },
              { id: "category", header: "Category", hideOnMobile: true, cell: (t) => TICKET_CATEGORY_LABELS[t.category] },
              {
                id: "priority",
                header: "Priority",
                cell: (t) => (
                  <StatusBadge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"} size="sm">
                    {TICKET_PRIORITY_LABELS[t.priority]}
                  </StatusBadge>
                ),
              },
              { id: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} domain="ticket" size="sm" overrides={{ pending_requester: { tone: "info", label: "Awaiting requester" } }} /> },
              {
                id: "sla",
                header: "Deadline",
                cell: (t) => (t.sla.firstResponse === "met" || t.sla.firstResponse === "none" ? <SlaBadge state={t.sla.resolution} prefix={t.resolutionDueAt ? "Resolution" : undefined} /> : <SlaBadge state={t.sla.firstResponse} prefix="First reply" />),
              },
              { id: "assignee", header: "Assignee", hideOnMobile: true, cell: (t) => t.assigneeName ?? <span className="text-muted-foreground">Unassigned</span> },
              { id: "activity", header: "Last activity", hideOnMobile: true, nowrap: true, cell: (t) => <RelativeTime value={t.lastMessageAt ?? t.createdAt} /> },
            ]}
            empty={<EmptyState title="No requests in this queue" description={parsed.q || parsed.category || parsed.priority ? "Try clearing the filters." : "New requests appear here as they arrive."} />}
            footer={<Pagination pathname={BASE} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="requests" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
